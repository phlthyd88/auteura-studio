import {
  deleteDB,
  openDB,
  type DBSchema,
  type IDBPDatabase,
} from 'idb';
import type {
  AuteuraFileSystemFileHandle,
  PreparedImportedMedia,
} from '../types/importedMedia';
import {
  assertStorageWriteCompatible,
  markCurrentClientWrite,
} from './AppCompatibilityService';

export interface MediaItem {
  readonly blob: Blob;
  readonly captureMode: 'burst' | 'photo' | 'recording' | 'timelapse';
  readonly createdAt: number;
  readonly durationMs?: number;
  readonly height?: number;
  readonly id: string;
  readonly isAvailable: boolean;
  readonly mimeType: string;
  readonly name: string;
  readonly origin: 'capture' | 'imported';
  readonly sizeBytes: number;
  readonly storageKind: 'copied-indexeddb' | 'file-system-handle';
  readonly thumbnail?: string;
  readonly timestamp: number;
  readonly type: 'image' | 'video';
  readonly width?: number;
}

export interface MediaQueryOptions {
  readonly sortBy?: 'largest' | 'newest' | 'oldest';
  readonly typeFilter?: 'all' | MediaItem['type'];
}

export interface MediaStorageStats {
  readonly copiedItemCount: number;
  readonly handleBackedItemCount: number;
  readonly itemCount: number;
  readonly maxAllowedBytes: number | null;
  readonly quotaBytes: number | null;
  readonly referencedBytes: number;
  readonly usageBytes: number;
}

export interface MediaItemDescriptor {
  readonly captureMode: MediaItem['captureMode'];
  readonly createdAt: number;
  readonly durationMs?: number;
  readonly height?: number;
  readonly id: string;
  readonly isAvailable: boolean;
  readonly mimeType: string;
  readonly name: string;
  readonly origin: MediaItem['origin'];
  readonly sizeBytes: number;
  readonly storageKind: MediaItem['storageKind'];
  readonly timestamp: number;
  readonly type: MediaItem['type'];
  readonly width?: number;
}

interface StoredBlobMediaItem {
  readonly blob: Blob;
  readonly captureMode: MediaItem['captureMode'];
  readonly createdAt: number;
  readonly durationMs?: number;
  readonly height?: number;
  readonly id: string;
  readonly kind: 'blob';
  readonly mimeType: string;
  readonly name: string;
  readonly origin: MediaItem['origin'];
  readonly sizeBytes: number;
  readonly thumbnail?: string;
  readonly timestamp: number;
  readonly type: MediaItem['type'];
  readonly width?: number;
}

interface StoredFileHandleMediaItem {
  readonly captureMode: 'photo';
  readonly createdAt: number;
  readonly durationMs?: number;
  readonly fileHandle?: AuteuraFileSystemFileHandle;
  readonly fileHandleCacheKey: string;
  readonly height?: number;
  readonly id: string;
  readonly kind: 'file-handle';
  readonly mimeType: string;
  readonly name: string;
  readonly origin: 'imported';
  readonly sizeBytes: number;
  readonly thumbnail?: string;
  readonly timestamp: number;
  readonly type: MediaItem['type'];
  readonly width?: number;
}

type StoredMediaItem = StoredBlobMediaItem | StoredFileHandleMediaItem;

interface AuteuraDatabaseSchema extends DBSchema {
  media: {
    indexes: {
      kind: StoredMediaItem['kind'];
      timestamp: number;
      type: MediaItem['type'];
    };
    key: string;
    value: StoredMediaItem;
  };
}

const databaseName = 'AuteuraDB';
const mediaStoreName = 'media';
const databaseVersion = 3;
const fallbackStorageBudgetBytes = 512 * 1024 * 1024;

let databasePromise: Promise<IDBPDatabase<AuteuraDatabaseSchema>> | null = null;
const transientFileHandleRegistry = new Map<string, AuteuraFileSystemFileHandle>();

type LegacyMediaItem = {
  readonly blob: Blob;
  readonly id: string;
  readonly thumbnail?: string;
  readonly timestamp: number;
  readonly type: 'image' | 'video';
};

function compareMediaItems(
  left: MediaItem,
  right: MediaItem,
  sortBy: NonNullable<MediaQueryOptions['sortBy']>,
): number {
  if (sortBy === 'oldest') {
    return left.timestamp - right.timestamp;
  }

  if (sortBy === 'largest') {
    return right.sizeBytes - left.sizeBytes || right.timestamp - left.timestamp;
  }

  return right.timestamp - left.timestamp;
}

function buildNormalizedLegacyMediaItem(item: MediaItem | LegacyMediaItem): MediaItem {
  const timestamp = item.timestamp;
  const mimeType =
    'mimeType' in item && typeof item.mimeType === 'string' && item.mimeType.length > 0
      ? item.mimeType
      : item.blob.type || (item.type === 'video' ? 'video/webm' : 'image/webp');
  const captureMode =
    'captureMode' in item && typeof item.captureMode === 'string'
      ? item.captureMode
      : item.type === 'video'
        ? 'recording'
        : 'photo';
  const createdAt =
    'createdAt' in item && typeof item.createdAt === 'number' ? item.createdAt : timestamp;
  const durationMs =
    'durationMs' in item && typeof item.durationMs === 'number' ? item.durationMs : undefined;
  const width = 'width' in item && typeof item.width === 'number' ? item.width : undefined;
  const height = 'height' in item && typeof item.height === 'number' ? item.height : undefined;
  const sizeBytes =
    'sizeBytes' in item && typeof item.sizeBytes === 'number' ? item.sizeBytes : item.blob.size;
  const name =
    'name' in item && typeof item.name === 'string' && item.name.length > 0
      ? item.name
      : `${captureMode}-${timestamp}.${item.type === 'video' ? 'webm' : 'webp'}`;

  return {
    blob: item.blob,
    captureMode,
    createdAt,
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(height === undefined ? {} : { height }),
    id: item.id,
    isAvailable: 'isAvailable' in item && typeof item.isAvailable === 'boolean' ? item.isAvailable : true,
    mimeType,
    name,
    origin: 'origin' in item && item.origin === 'imported' ? 'imported' : 'capture',
    sizeBytes,
    storageKind:
      'storageKind' in item &&
      (item.storageKind === 'file-system-handle' || item.storageKind === 'copied-indexeddb')
        ? item.storageKind
        : 'copied-indexeddb',
    ...('thumbnail' in item && typeof item.thumbnail === 'string'
      ? { thumbnail: item.thumbnail }
      : {}),
    timestamp,
    type: item.type,
    ...(width === undefined ? {} : { width }),
  };
}

function buildMediaItemDescriptor(item: StoredMediaItem | LegacyMediaItem): MediaItemDescriptor {
  if ('kind' in item && item.kind === 'file-handle') {
    return {
      captureMode: item.captureMode,
      createdAt: item.createdAt,
      ...(item.durationMs === undefined ? {} : { durationMs: item.durationMs }),
      ...(item.height === undefined ? {} : { height: item.height }),
      id: item.id,
      isAvailable:
        item.fileHandle !== undefined || transientFileHandleRegistry.has(item.fileHandleCacheKey),
      mimeType: item.mimeType,
      name: item.name,
      origin: 'imported',
      sizeBytes: item.sizeBytes,
      storageKind: 'file-system-handle',
      timestamp: item.timestamp,
      type: item.type,
      ...(item.width === undefined ? {} : { width: item.width }),
    };
  }

  const normalizedItem = buildNormalizedLegacyMediaItem(item);

  return {
    captureMode: normalizedItem.captureMode,
    createdAt: normalizedItem.createdAt,
    ...(normalizedItem.durationMs === undefined ? {} : { durationMs: normalizedItem.durationMs }),
    ...(normalizedItem.height === undefined ? {} : { height: normalizedItem.height }),
    id: normalizedItem.id,
    isAvailable: normalizedItem.isAvailable,
    mimeType: normalizedItem.mimeType,
    name: normalizedItem.name,
    origin: normalizedItem.origin,
    sizeBytes: normalizedItem.sizeBytes,
    storageKind: normalizedItem.storageKind,
    timestamp: normalizedItem.timestamp,
    type: normalizedItem.type,
    ...(normalizedItem.width === undefined ? {} : { width: normalizedItem.width }),
  };
}

function buildStoredBlobMediaItem(item: MediaItem): StoredBlobMediaItem {
  return {
    blob: item.blob,
    captureMode: item.captureMode,
    createdAt: item.createdAt,
    ...(item.durationMs === undefined ? {} : { durationMs: item.durationMs }),
    ...(item.height === undefined ? {} : { height: item.height }),
    id: item.id,
    kind: 'blob',
    mimeType: item.mimeType,
    name: item.name,
    origin: item.origin,
    sizeBytes: item.sizeBytes,
    ...(item.thumbnail === undefined ? {} : { thumbnail: item.thumbnail }),
    timestamp: item.timestamp,
    type: item.type,
    ...(item.width === undefined ? {} : { width: item.width }),
  };
}

function isStoredBlobMediaItem(
  item: StoredMediaItem | LegacyMediaItem,
): item is StoredBlobMediaItem | LegacyMediaItem {
  return !('kind' in item) || item.kind === 'blob';
}

function calculateStoredRecordBudgetBytes(item: StoredMediaItem | LegacyMediaItem): number {
  if (!isStoredBlobMediaItem(item)) {
    return 0;
  }

  return 'sizeBytes' in item && typeof item.sizeBytes === 'number' ? item.sizeBytes : item.blob.size;
}

function getDatabase(): Promise<IDBPDatabase<AuteuraDatabaseSchema>> {
  if (databasePromise === null) {
    databasePromise = openDB<AuteuraDatabaseSchema>(databaseName, databaseVersion, {
      blocking(): void {
        databasePromise = null;
      },
      terminated(): void {
        databasePromise = null;
      },
      upgrade(database, _oldVersion, _newVersion, transaction): void {
        let mediaStore;

        if (!database.objectStoreNames.contains(mediaStoreName)) {
          mediaStore = database.createObjectStore(mediaStoreName, {
            keyPath: 'id',
          });
        } else {
          mediaStore = transaction.objectStore(mediaStoreName);
        }

        if (!mediaStore.indexNames.contains('timestamp')) {
          mediaStore.createIndex('timestamp', 'timestamp');
        }

        if (!mediaStore.indexNames.contains('type')) {
          mediaStore.createIndex('type', 'type');
        }

        if (!mediaStore.indexNames.contains('kind')) {
          mediaStore.createIndex('kind', 'kind');
        }
      },
    }).catch((error: unknown): never => {
      databasePromise = null;
      throw error instanceof Error
        ? error
        : new Error('Failed to initialize the media database.');
    });
  }

  return databasePromise;
}

async function resolveStoredMediaItem(
  item: StoredMediaItem | LegacyMediaItem,
  mode: 'library' | 'strict',
): Promise<MediaItem | null> {
  if ('kind' in item && item.kind === 'file-handle') {
    try {
      const fileHandle =
        item.fileHandle ?? transientFileHandleRegistry.get(item.fileHandleCacheKey);

      if (fileHandle === undefined) {
        throw new Error('Linked file handle is unavailable.');
      }

      const file = await fileHandle.getFile();

      return {
        blob: file,
        captureMode: item.captureMode,
        createdAt: item.createdAt,
        ...(item.durationMs === undefined ? {} : { durationMs: item.durationMs }),
        ...(item.height === undefined ? {} : { height: item.height }),
        id: item.id,
        isAvailable: true,
        mimeType: file.type || item.mimeType,
        name: item.name,
        origin: 'imported',
        sizeBytes: file.size,
        storageKind: 'file-system-handle',
        ...(item.thumbnail === undefined ? {} : { thumbnail: item.thumbnail }),
        timestamp: item.timestamp,
        type: item.type,
        ...(item.width === undefined ? {} : { width: item.width }),
      };
    } catch {
      if (mode === 'strict') {
        return null;
      }

      return {
        blob: new Blob([], { type: item.mimeType }),
        captureMode: item.captureMode,
        createdAt: item.createdAt,
        ...(item.durationMs === undefined ? {} : { durationMs: item.durationMs }),
        ...(item.height === undefined ? {} : { height: item.height }),
        id: item.id,
        isAvailable: false,
        mimeType: item.mimeType,
        name: item.name,
        origin: 'imported',
        sizeBytes: item.sizeBytes,
        storageKind: 'file-system-handle',
        ...(item.thumbnail === undefined ? {} : { thumbnail: item.thumbnail }),
        timestamp: item.timestamp,
        type: item.type,
        ...(item.width === undefined ? {} : { width: item.width }),
      };
    }
  }

  return buildNormalizedLegacyMediaItem(
    'kind' in item ? {
      ...item,
      blob: item.blob,
      isAvailable: true,
      storageKind: 'copied-indexeddb',
    } : item,
  );
}

async function getStoredItemsInternal(
  mode: 'library' | 'strict' = 'library',
): Promise<readonly MediaItem[]> {
  const database = await getDatabase();
  const storedItems = await database.getAll(mediaStoreName);
  const resolvedItems = await Promise.all(
    storedItems.map((item: StoredMediaItem): Promise<MediaItem | null> =>
      resolveStoredMediaItem(item, mode),
    ),
  );

  return resolvedItems.filter((item: MediaItem | null): item is MediaItem => item !== null);
}

async function getStorageBudget(): Promise<{
  readonly maxAllowedBytes: number | null;
  readonly quotaBytes: number | null;
}> {
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.storage === 'undefined' ||
    typeof navigator.storage.estimate !== 'function'
  ) {
    return {
      maxAllowedBytes: fallbackStorageBudgetBytes,
      quotaBytes: null,
    };
  }

  try {
    const estimate = await navigator.storage.estimate();
    const quotaBytes = typeof estimate.quota === 'number' ? estimate.quota : null;

    if (quotaBytes === null) {
      return {
        maxAllowedBytes: fallbackStorageBudgetBytes,
        quotaBytes: null,
      };
    }

    return {
      maxAllowedBytes: Math.min(fallbackStorageBudgetBytes, Math.floor(quotaBytes * 0.6)),
      quotaBytes,
    };
  } catch {
    return {
      maxAllowedBytes: fallbackStorageBudgetBytes,
      quotaBytes: null,
    };
  }
}

async function enforceStorageBudget(
  database: IDBPDatabase<AuteuraDatabaseSchema>,
  incomingBytes: number,
): Promise<void> {
  const { maxAllowedBytes } = await getStorageBudget();

  if (maxAllowedBytes === null) {
    return;
  }

  if (incomingBytes > maxAllowedBytes) {
    throw new Error('The import exceeds the current browser storage budget.');
  }

  const existingItems = await database.getAll(mediaStoreName);
  let currentUsage = existingItems.reduce(
    (totalBytes: number, item: StoredMediaItem): number =>
      totalBytes + calculateStoredRecordBudgetBytes(item),
    0,
  );

  const itemsByAge = existingItems
    .filter((item: StoredMediaItem): item is StoredBlobMediaItem => item.kind === 'blob')
    .sort(
      (left: StoredBlobMediaItem, right: StoredBlobMediaItem): number =>
        left.timestamp - right.timestamp,
    );

  while (currentUsage + incomingBytes > maxAllowedBytes && itemsByAge.length > 0) {
    const oldestItem = itemsByAge.shift();

    if (oldestItem === undefined) {
      break;
    }

    await database.delete(mediaStoreName, oldestItem.id);
    currentUsage -= oldestItem.sizeBytes;
  }

  if (currentUsage + incomingBytes > maxAllowedBytes) {
    throw new Error('Not enough storage is available to copy the selected media.');
  }
}

export async function saveMedia(item: MediaItem): Promise<void> {
  assertStorageWriteCompatible();
  const database = await getDatabase();
  await enforceStorageBudget(database, item.sizeBytes);
  await database.put(mediaStoreName, buildStoredBlobMediaItem(item));
  markCurrentClientWrite();
}

export async function ensureImportCopyCapacity(incomingBytes: number): Promise<void> {
  const database = await getDatabase();
  await enforceStorageBudget(database, incomingBytes);
}

export async function saveImportedMedia(importedMedia: PreparedImportedMedia): Promise<void> {
  assertStorageWriteCompatible();
  const database = await getDatabase();

  if (
    importedMedia.importStrategy === 'file-system-handle' &&
    importedMedia.fileHandle !== null
  ) {
    const fileHandleCacheKey = crypto.randomUUID();
    transientFileHandleRegistry.set(fileHandleCacheKey, importedMedia.fileHandle);
    const storedHandleItem: StoredFileHandleMediaItem = {
      captureMode: 'photo',
      createdAt: importedMedia.timestamp,
      ...(importedMedia.durationMs === undefined ? {} : { durationMs: importedMedia.durationMs }),
      fileHandle: importedMedia.fileHandle,
      fileHandleCacheKey,
      ...(importedMedia.height === undefined ? {} : { height: importedMedia.height }),
      id: crypto.randomUUID(),
      kind: 'file-handle',
      mimeType: importedMedia.mimeType,
      name: importedMedia.name,
      origin: 'imported',
      sizeBytes: importedMedia.sizeBytes,
      ...(importedMedia.thumbnail === undefined ? {} : { thumbnail: importedMedia.thumbnail }),
      timestamp: importedMedia.timestamp,
      type: importedMedia.type,
      ...(importedMedia.width === undefined ? {} : { width: importedMedia.width }),
    };
    try {
      await database.put(mediaStoreName, storedHandleItem);
    } catch {
      const { fileHandle: _ignoredHandle, ...metadataOnlyRecord } = storedHandleItem;
      await database.put(mediaStoreName, metadataOnlyRecord);
    }
    markCurrentClientWrite();
    return;
  }

  await saveMedia({
    blob: importedMedia.file,
    captureMode: 'photo',
    createdAt: importedMedia.timestamp,
    ...(importedMedia.durationMs === undefined ? {} : { durationMs: importedMedia.durationMs }),
    ...(importedMedia.height === undefined ? {} : { height: importedMedia.height }),
    id: crypto.randomUUID(),
    isAvailable: true,
    mimeType: importedMedia.mimeType,
    name: importedMedia.name,
    origin: 'imported',
    sizeBytes: importedMedia.sizeBytes,
    storageKind: 'copied-indexeddb',
    ...(importedMedia.thumbnail === undefined ? {} : { thumbnail: importedMedia.thumbnail }),
    timestamp: importedMedia.timestamp,
    type: importedMedia.type,
    ...(importedMedia.width === undefined ? {} : { width: importedMedia.width }),
  });
}

export async function getAllMedia(
  options: MediaQueryOptions = {},
): Promise<readonly MediaItem[]> {
  const storedItems = await getStoredItemsInternal('library');
  const typeFilter = options.typeFilter ?? 'all';
  const sortBy = options.sortBy ?? 'newest';

  return storedItems
    .filter((item: MediaItem): boolean => typeFilter === 'all' || item.type === typeFilter)
    .sort((left: MediaItem, right: MediaItem): number => compareMediaItems(left, right, sortBy));
}

export async function getMediaById(id: string): Promise<MediaItem | null> {
  const database = await getDatabase();
  const storedItem = await database.get(mediaStoreName, id);

  if (storedItem === undefined) {
    return null;
  }

  return resolveStoredMediaItem(storedItem, 'strict');
}

export async function getMediaDescriptorsByIds(
  ids: readonly string[],
): Promise<readonly MediaItemDescriptor[]> {
  if (ids.length === 0) {
    return [];
  }

  const database = await getDatabase();
  const descriptors = await Promise.all(
    [...new Set(ids)].map(async (id: string): Promise<MediaItemDescriptor | null> => {
      const storedItem = await database.get(mediaStoreName, id);

      if (storedItem === undefined) {
        return null;
      }

      return buildMediaItemDescriptor(storedItem);
    }),
  );

  return descriptors.filter(
    (descriptor: MediaItemDescriptor | null): descriptor is MediaItemDescriptor =>
      descriptor !== null,
  );
}

export async function deleteMedia(id: string): Promise<void> {
  assertStorageWriteCompatible();
  const database = await getDatabase();
  const storedItem = await database.get(mediaStoreName, id);
  if (storedItem?.kind === 'file-handle') {
    transientFileHandleRegistry.delete(storedItem.fileHandleCacheKey);
  }
  await database.delete(mediaStoreName, id);
  markCurrentClientWrite();
}

export async function clearAll(): Promise<void> {
  assertStorageWriteCompatible();
  const database = await getDatabase();
  await database.clear(mediaStoreName);
  transientFileHandleRegistry.clear();
  markCurrentClientWrite();
}

export async function resetMediaDatabase(): Promise<void> {
  const currentDatabasePromise = databasePromise;
  databasePromise = null;

  if (currentDatabasePromise !== null) {
    try {
      const database = await currentDatabasePromise;
      database.close();
    } catch {
      // If initialization already failed, proceed with deleting the database by name.
    }
  }

  await deleteDB(databaseName);
  transientFileHandleRegistry.clear();
}

export async function getMediaStorageStats(): Promise<MediaStorageStats> {
  const database = await getDatabase();
  const storedItems = await database.getAll(mediaStoreName);
  const usageBytes = storedItems.reduce(
    (totalBytes: number, item: StoredMediaItem): number =>
      totalBytes + calculateStoredRecordBudgetBytes(item),
    0,
  );
  const referencedBytes = storedItems.reduce(
    (totalBytes: number, item: StoredMediaItem): number =>
      item.kind === 'file-handle' ? totalBytes + item.sizeBytes : totalBytes,
    0,
  );
  const handleBackedItemCount = storedItems.filter(
    (item: StoredMediaItem): boolean => item.kind === 'file-handle',
  ).length;
  const { maxAllowedBytes, quotaBytes } = await getStorageBudget();

  return {
    copiedItemCount: storedItems.length - handleBackedItemCount,
    handleBackedItemCount,
    itemCount: storedItems.length,
    maxAllowedBytes,
    quotaBytes,
    referencedBytes,
    usageBytes,
  };
}
