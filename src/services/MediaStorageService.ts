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

export type MediaAvailability = 'available' | 'unavailable-linked';

export interface MediaItem {
  readonly availability: MediaAvailability;
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

export interface MediaPlaybackHandle {
  readonly mediaItem: MediaItem;
  readonly release: () => void;
  readonly sourceUrl: string;
}

export interface ChunkedRecordingMediaDraft {
  readonly captureMode: 'recording';
  readonly createdAt: number;
  readonly height?: number;
  readonly id: string;
  readonly mimeType: string;
  readonly name: string;
  readonly origin: 'capture';
  readonly thumbnail?: string;
  readonly timestamp: number;
  readonly type: 'video';
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

interface StoredCopiedMediaItem {
  readonly captureMode: MediaItem['captureMode'];
  readonly createdAt: number;
  readonly durationMs?: number;
  readonly height?: number;
  readonly id: string;
  readonly kind: 'copied-indexeddb';
  readonly mimeType: string;
  readonly name: string;
  readonly origin: MediaItem['origin'];
  readonly sizeBytes: number;
  readonly thumbnail?: string;
  readonly timestamp: number;
  readonly type: MediaItem['type'];
  readonly width?: number;
}

interface StoredChunkedRecordingMediaItem {
  readonly captureMode: 'recording';
  readonly chunkCount: number;
  readonly createdAt: number;
  readonly durationMs?: number;
  readonly height?: number;
  readonly id: string;
  readonly kind: 'chunked-recording';
  readonly mimeType: string;
  readonly name: string;
  readonly origin: 'capture';
  readonly sizeBytes: number;
  readonly thumbnail?: string;
  readonly timestamp: number;
  readonly type: 'video';
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

type StoredMediaItem =
  | StoredCopiedMediaItem
  | StoredChunkedRecordingMediaItem
  | StoredFileHandleMediaItem;

type LegacyStoredMediaItem = StoredBlobMediaItem | StoredMediaItem;

interface StoredRecordingChunk {
  readonly blob: Blob;
  readonly recordingId: string;
  readonly sequence: number;
  readonly sizeBytes: number;
}

interface StoredMediaBlob {
  readonly blob: Blob;
  readonly mediaId: string;
}

interface StoredMigrationAudit {
  readonly completedAt: number;
  readonly fromVersion: number;
  readonly id: string;
  readonly migratedBlobCount: number;
  readonly migratedBytes: number;
  readonly recordSetChecksum: string;
  readonly verifiedBlobCount: number;
}

interface AuteuraDatabaseSchema extends DBSchema {
  media: {
    indexes: {
      kind: LegacyStoredMediaItem['kind'];
      timestamp: number;
      type: MediaItem['type'];
    };
    key: string;
    value: LegacyStoredMediaItem;
  };
  mediaBlobs: {
    key: string;
    value: StoredMediaBlob;
  };
  migrationAudit: {
    key: string;
    value: StoredMigrationAudit;
  };
  recordingChunks: {
    indexes: {
      recordingId: string;
    };
    key: [string, number];
    value: StoredRecordingChunk;
  };
}

const databaseName = 'AuteuraDB';
const mediaStoreName = 'media';
const mediaBlobStoreName = 'mediaBlobs';
const migrationAuditStoreName = 'migrationAudit';
const recordingChunkStoreName = 'recordingChunks';
const databaseVersion = 6;
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
  const itemBlob = item.blob;
  const timestamp = item.timestamp;
  const mimeType =
    'mimeType' in item && typeof item.mimeType === 'string' && item.mimeType.length > 0
      ? item.mimeType
      : itemBlob.type || (item.type === 'video' ? 'video/webm' : 'image/webp');
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
    'sizeBytes' in item && typeof item.sizeBytes === 'number' ? item.sizeBytes : itemBlob.size;
  const name =
    'name' in item && typeof item.name === 'string' && item.name.length > 0
      ? item.name
      : `${captureMode}-${timestamp}.${item.type === 'video' ? 'webm' : 'webp'}`;

  return {
    availability:
      'availability' in item && item.availability === 'unavailable-linked'
        ? 'unavailable-linked'
        : 'available',
    blob: itemBlob,
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

function buildMediaItemDescriptor(item: LegacyStoredMediaItem | LegacyMediaItem): MediaItemDescriptor {
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

  if ('kind' in item && item.kind === 'chunked-recording') {
    return {
      captureMode: item.captureMode,
      createdAt: item.createdAt,
      ...(item.durationMs === undefined ? {} : { durationMs: item.durationMs }),
      ...(item.height === undefined ? {} : { height: item.height }),
      id: item.id,
      isAvailable: true,
      mimeType: item.mimeType,
      name: item.name,
      origin: item.origin,
      sizeBytes: item.sizeBytes,
      storageKind: 'copied-indexeddb',
      timestamp: item.timestamp,
      type: item.type,
      ...(item.width === undefined ? {} : { width: item.width }),
    };
  }

  if ('kind' in item && item.kind === 'copied-indexeddb') {
    return {
      captureMode: item.captureMode,
      createdAt: item.createdAt,
      ...(item.durationMs === undefined ? {} : { durationMs: item.durationMs }),
      ...(item.height === undefined ? {} : { height: item.height }),
      id: item.id,
      isAvailable: true,
      mimeType: item.mimeType,
      name: item.name,
      origin: item.origin,
      sizeBytes: item.sizeBytes,
      storageKind: 'copied-indexeddb',
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

function buildStoredCopiedMediaItem(item: MediaItem): StoredCopiedMediaItem {
  return {
    captureMode: item.captureMode,
    createdAt: item.createdAt,
    ...(item.durationMs === undefined ? {} : { durationMs: item.durationMs }),
    ...(item.height === undefined ? {} : { height: item.height }),
    id: item.id,
    kind: 'copied-indexeddb',
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

function buildMigrationRecordChecksum(
  records: readonly {
    readonly id: string;
    readonly mimeType: string;
    readonly sizeBytes: number;
  }[],
): string {
  let checksum = 2166136261;
  const normalizedRecordSet = [...records].sort((left, right): number =>
    left.id.localeCompare(right.id),
  );

  for (const record of normalizedRecordSet) {
    const payload = `${record.id}:${record.mimeType}:${record.sizeBytes}`;

    for (let index = 0; index < payload.length; index += 1) {
      checksum ^= payload.charCodeAt(index);
      checksum = Math.imul(checksum, 16777619);
    }
  }

  return `fnv1a-${(checksum >>> 0).toString(16).padStart(8, '0')}`;
}

function buildStoredChunkedRecordingMediaItem(
  item: ChunkedRecordingMediaDraft,
): StoredChunkedRecordingMediaItem {
  return {
    captureMode: item.captureMode,
    chunkCount: 0,
    createdAt: item.createdAt,
    ...(item.height === undefined ? {} : { height: item.height }),
    id: item.id,
    kind: 'chunked-recording',
    mimeType: item.mimeType,
    name: item.name,
    origin: item.origin,
    sizeBytes: 0,
    ...(item.thumbnail === undefined ? {} : { thumbnail: item.thumbnail }),
    timestamp: item.timestamp,
    type: item.type,
    ...(item.width === undefined ? {} : { width: item.width }),
  };
}

function isStoredBlobMediaItem(
  item: LegacyStoredMediaItem | LegacyMediaItem,
): item is StoredBlobMediaItem | LegacyMediaItem {
  return !('kind' in item) || item.kind === 'blob';
}

function calculateStoredRecordBudgetBytes(item: LegacyStoredMediaItem | LegacyMediaItem): number {
  if ('kind' in item && item.kind === 'chunked-recording') {
    return item.sizeBytes;
  }

  if ('kind' in item && item.kind === 'copied-indexeddb') {
    return item.sizeBytes;
  }

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
      // `idb` upgrade handlers can safely await request promises within the active upgrade transaction.
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async upgrade(database, _oldVersion, _newVersion, transaction): Promise<void> {
        let mediaStore;
        let mediaBlobStore;
        let migrationAuditStore;
        let recordingChunkStore;

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

        if (!database.objectStoreNames.contains(mediaBlobStoreName)) {
          mediaBlobStore = database.createObjectStore(mediaBlobStoreName, {
            keyPath: 'mediaId',
          });
        } else {
          mediaBlobStore = transaction.objectStore(mediaBlobStoreName);
        }

        if (!database.objectStoreNames.contains(migrationAuditStoreName)) {
          migrationAuditStore = database.createObjectStore(migrationAuditStoreName, {
            keyPath: 'id',
          });
        } else {
          migrationAuditStore = transaction.objectStore(migrationAuditStoreName);
        }

        if (!database.objectStoreNames.contains(recordingChunkStoreName)) {
          recordingChunkStore = database.createObjectStore(recordingChunkStoreName, {
            keyPath: ['recordingId', 'sequence'],
          });
        } else {
          recordingChunkStore = transaction.objectStore(recordingChunkStoreName);
        }

        if (!recordingChunkStore.indexNames.contains('recordingId')) {
          recordingChunkStore.createIndex('recordingId', 'recordingId');
        }

        if (_oldVersion < 5) {
          const migratedRecords: {
            id: string;
            mimeType: string;
            sizeBytes: number;
          }[] = [];
          let cursor = await mediaStore.openCursor();

          while (cursor !== null) {
            const value = cursor.value as LegacyStoredMediaItem | LegacyMediaItem;

            if (!('kind' in value) || value.kind === 'blob') {
              const normalizedItem = buildNormalizedLegacyMediaItem(
                'kind' in value
                  ? {
                      ...value,
                      blob: value.blob,
                      isAvailable: true,
                      storageKind: 'copied-indexeddb',
                    }
                  : value,
              );
              await mediaBlobStore.put({
                blob: normalizedItem.blob,
                mediaId: normalizedItem.id,
              });
              await cursor.update(buildStoredCopiedMediaItem(normalizedItem));
              migratedRecords.push({
                id: normalizedItem.id,
                mimeType: normalizedItem.mimeType,
                sizeBytes: normalizedItem.sizeBytes,
              });
            }

            cursor = await cursor.continue();
          }

          let verifiedBlobCount = 0;

          for (const migratedRecord of migratedRecords) {
            const migratedMetadata = await mediaStore.get(migratedRecord.id);
            const migratedBlob = await mediaBlobStore.get(migratedRecord.id);

            if (migratedMetadata?.kind !== 'copied-indexeddb') {
              throw new Error(
                `Media library migration failed to rewrite metadata for ${migratedRecord.id}.`,
              );
            }

            if (
              migratedBlob === undefined ||
              migratedBlob.blob.size !== migratedRecord.sizeBytes
            ) {
              throw new Error(
                `Media library migration failed to verify blob payload for ${migratedRecord.id}.`,
              );
            }

            verifiedBlobCount += 1;
          }

          await migrationAuditStore.put({
            completedAt: Date.now(),
            fromVersion: _oldVersion,
            id: 'media-split-v5',
            migratedBlobCount: migratedRecords.length,
            migratedBytes: migratedRecords.reduce(
              (totalBytes, record): number => totalBytes + record.sizeBytes,
              0,
            ),
            recordSetChecksum: buildMigrationRecordChecksum(migratedRecords),
            verifiedBlobCount,
          });
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
  item: LegacyStoredMediaItem | LegacyMediaItem,
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
        availability: 'available',
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
        availability: 'unavailable-linked',
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

  if ('kind' in item && item.kind === 'chunked-recording') {
    if (mode === 'library') {
      return {
        availability: 'available',
        blob: new Blob([], { type: item.mimeType }),
        captureMode: item.captureMode,
        createdAt: item.createdAt,
        ...(item.durationMs === undefined ? {} : { durationMs: item.durationMs }),
        ...(item.height === undefined ? {} : { height: item.height }),
        id: item.id,
        isAvailable: true,
        mimeType: item.mimeType,
        name: item.name,
        origin: item.origin,
        sizeBytes: item.sizeBytes,
        storageKind: 'copied-indexeddb',
        ...(item.thumbnail === undefined ? {} : { thumbnail: item.thumbnail }),
        timestamp: item.timestamp,
        type: item.type,
        ...(item.width === undefined ? {} : { width: item.width }),
      };
    }

    const database = await getDatabase();
    const orderedChunkBlobs = await loadRecordingChunkBlobs(database, item.id);

    return {
      availability: 'available',
      blob: new Blob([...orderedChunkBlobs], { type: item.mimeType }),
      captureMode: item.captureMode,
      createdAt: item.createdAt,
      ...(item.durationMs === undefined ? {} : { durationMs: item.durationMs }),
      ...(item.height === undefined ? {} : { height: item.height }),
      id: item.id,
      isAvailable: true,
      mimeType: item.mimeType,
      name: item.name,
      origin: item.origin,
      sizeBytes: item.sizeBytes,
      storageKind: 'copied-indexeddb',
      ...(item.thumbnail === undefined ? {} : { thumbnail: item.thumbnail }),
      timestamp: item.timestamp,
      type: item.type,
      ...(item.width === undefined ? {} : { width: item.width }),
    };
  }

  if ('kind' in item && item.kind === 'copied-indexeddb') {
    if (mode === 'library') {
      return {
        availability: 'available',
        blob: new Blob([], { type: item.mimeType }),
        captureMode: item.captureMode,
        createdAt: item.createdAt,
        ...(item.durationMs === undefined ? {} : { durationMs: item.durationMs }),
        ...(item.height === undefined ? {} : { height: item.height }),
        id: item.id,
        isAvailable: true,
        mimeType: item.mimeType,
        name: item.name,
        origin: item.origin,
        sizeBytes: item.sizeBytes,
        storageKind: 'copied-indexeddb',
        ...(item.thumbnail === undefined ? {} : { thumbnail: item.thumbnail }),
        timestamp: item.timestamp,
        type: item.type,
        ...(item.width === undefined ? {} : { width: item.width }),
      };
    }

    const database = await getDatabase();
    const storedBlob = await database.get(mediaBlobStoreName, item.id);

    if (storedBlob === undefined) {
      return null;
    }

    return {
      availability: 'available',
      blob: storedBlob.blob,
      captureMode: item.captureMode,
      createdAt: item.createdAt,
      ...(item.durationMs === undefined ? {} : { durationMs: item.durationMs }),
      ...(item.height === undefined ? {} : { height: item.height }),
      id: item.id,
      isAvailable: true,
      mimeType: item.mimeType,
      name: item.name,
      origin: item.origin,
      sizeBytes: item.sizeBytes,
      storageKind: 'copied-indexeddb',
      ...(item.thumbnail === undefined ? {} : { thumbnail: item.thumbnail }),
      timestamp: item.timestamp,
      type: item.type,
      ...(item.width === undefined ? {} : { width: item.width }),
    };
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

function createObjectUrlHandle(mediaItem: MediaItem, blob: Blob): MediaPlaybackHandle {
  const sourceUrl = URL.createObjectURL(blob);

  return {
    mediaItem,
    release: (): void => {
      URL.revokeObjectURL(sourceUrl);
    },
    sourceUrl,
  };
}

async function listRecordingChunkKeys(
  database: IDBPDatabase<AuteuraDatabaseSchema>,
  recordingId: string,
): Promise<readonly [string, number][]> {
  const chunkKeys = await database.getAllKeysFromIndex(
    recordingChunkStoreName,
    'recordingId',
    recordingId,
  );

  return [...chunkKeys].sort(
    (left: [string, number], right: [string, number]): number => left[1] - right[1],
  );
}

async function loadRecordingChunkBlobs(
  database: IDBPDatabase<AuteuraDatabaseSchema>,
  recordingId: string,
): Promise<readonly Blob[]> {
  const blobs: Blob[] = [];

  for (const chunkKey of await listRecordingChunkKeys(database, recordingId)) {
    const chunkItem = await database.get(recordingChunkStoreName, chunkKey);

    if (chunkItem !== undefined) {
      blobs.push(chunkItem.blob);
    }
  }

  return blobs;
}

function appendSourceBufferChunk(
  sourceBuffer: SourceBuffer,
  chunkBuffer: ArrayBuffer,
): Promise<void> {
  return new Promise((resolve: () => void, reject: (error: Error) => void): void => {
    function cleanup(): void {
      sourceBuffer.removeEventListener('error', handleError);
      sourceBuffer.removeEventListener('updateend', handleUpdateEnd);
    }

    function handleError(): void {
      cleanup();
      reject(new Error('Failed to append chunked media to the playback buffer.'));
    }

    function handleUpdateEnd(): void {
      cleanup();
      resolve();
    }

    sourceBuffer.addEventListener('error', handleError, { once: true });
    sourceBuffer.addEventListener('updateend', handleUpdateEnd, { once: true });
    sourceBuffer.appendBuffer(chunkBuffer);
  });
}

async function createChunkedPlaybackHandle(
  item: StoredChunkedRecordingMediaItem,
): Promise<MediaPlaybackHandle | null> {
  if (typeof MediaSource === 'undefined') {
    return null;
  }

  const mediaItem = await resolveStoredMediaItem(item, 'library');

  if (mediaItem === null) {
    return null;
  }

  const database = await getDatabase();
  const chunkKeys = await listRecordingChunkKeys(database, item.id);
  const mediaSource = new MediaSource();
  const sourceUrl = URL.createObjectURL(mediaSource);
  let released = false;

  mediaSource.addEventListener(
    'sourceopen',
    (): void => {
      void (async (): Promise<void> => {
        try {
          const sourceBuffer = mediaSource.addSourceBuffer(item.mimeType);

          for (const chunkKey of chunkKeys) {
            if (released) {
              return;
            }

            const chunkItem = await database.get(recordingChunkStoreName, chunkKey);

            if (chunkItem === undefined) {
              continue;
            }

            await appendSourceBufferChunk(sourceBuffer, await chunkItem.blob.arrayBuffer());
          }

          if (!released && mediaSource.readyState === 'open') {
            mediaSource.endOfStream();
          }
        } catch {
          if (!released && mediaSource.readyState === 'open') {
            try {
              mediaSource.endOfStream('decode');
            } catch {
              // Ignore end-of-stream races during playback setup failure.
            }
          }
        }
      })();
    },
    { once: true },
  );

  return {
    mediaItem,
    release: (): void => {
      released = true;
      URL.revokeObjectURL(sourceUrl);
    },
    sourceUrl,
  };
}

async function getStoredItemsInternal(
  mode: 'library' | 'strict' = 'library',
): Promise<readonly MediaItem[]> {
  const database = await getDatabase();
  const storedItems = await database.getAll(mediaStoreName);
  const resolvedItems = await Promise.all(
    storedItems.map((item: LegacyStoredMediaItem): Promise<MediaItem | null> =>
      resolveStoredMediaItem(item, mode),
    ),
  );

  return resolvedItems.filter((item: MediaItem | null): item is MediaItem => item !== null);
}

async function reduceStoredMediaItems<T>(
  database: IDBPDatabase<AuteuraDatabaseSchema>,
  reducer: (accumulator: T, item: LegacyStoredMediaItem) => T,
  initialValue: T,
): Promise<T> {
  const transaction = database.transaction(mediaStoreName, 'readonly');
  let accumulator = initialValue;
  let cursor = await transaction.store.openCursor();

  while (cursor !== null) {
    accumulator = reducer(accumulator, cursor.value);
    cursor = await cursor.continue();
  }

  await transaction.done;
  return accumulator;
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

  const storageBudgetSnapshot = await reduceStoredMediaItems(
    database,
    (
      snapshot: {
        currentUsage: number;
        itemsByAge: Array<StoredCopiedMediaItem | StoredChunkedRecordingMediaItem>;
      },
      item: LegacyStoredMediaItem,
    ) => {
      snapshot.currentUsage += calculateStoredRecordBudgetBytes(item);

      if ('kind' in item && (item.kind === 'copied-indexeddb' || item.kind === 'chunked-recording')) {
        snapshot.itemsByAge.push(item);
      }

      return snapshot;
    },
    {
      currentUsage: 0,
      itemsByAge: [],
    },
  );
  let currentUsage = storageBudgetSnapshot.currentUsage;
  const itemsByAge = storageBudgetSnapshot.itemsByAge.sort(
    (
      left: StoredCopiedMediaItem | StoredChunkedRecordingMediaItem,
      right: StoredCopiedMediaItem | StoredChunkedRecordingMediaItem,
    ): number => left.timestamp - right.timestamp,
  );

  while (currentUsage + incomingBytes > maxAllowedBytes && itemsByAge.length > 0) {
    const oldestItem = itemsByAge.shift();

    if (oldestItem === undefined) {
      break;
    }

    if (oldestItem.kind === 'chunked-recording') {
      const chunkKeys = await database.getAllKeysFromIndex(
        recordingChunkStoreName,
        'recordingId',
        oldestItem.id,
      );
      const transaction = database.transaction([mediaStoreName, recordingChunkStoreName], 'readwrite');
      await Promise.all(
        chunkKeys.map((chunkKey: [string, number]): Promise<void> =>
          transaction.objectStore(recordingChunkStoreName).delete(chunkKey),
        ),
      );
      await transaction.objectStore(mediaStoreName).delete(oldestItem.id);
      await transaction.done;
    } else {
      const transaction = database.transaction([mediaStoreName, mediaBlobStoreName], 'readwrite');
      await transaction.objectStore(mediaBlobStoreName).delete(oldestItem.id);
      await transaction.objectStore(mediaStoreName).delete(oldestItem.id);
      await transaction.done;
    }
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
  const transaction = database.transaction([mediaStoreName, mediaBlobStoreName], 'readwrite');
  await transaction.objectStore(mediaStoreName).put(buildStoredCopiedMediaItem(item));
  await transaction.objectStore(mediaBlobStoreName).put({
    blob: item.blob,
    mediaId: item.id,
  });
  await transaction.done;
  markCurrentClientWrite();
}

export async function createChunkedRecordingMedia(
  item: ChunkedRecordingMediaDraft,
): Promise<void> {
  assertStorageWriteCompatible();
  const database = await getDatabase();
  await database.put(mediaStoreName, buildStoredChunkedRecordingMediaItem(item));
  markCurrentClientWrite();
}

export async function appendChunkedRecordingMediaChunk(
  recordingId: string,
  sequence: number,
  chunk: Blob,
): Promise<void> {
  assertStorageWriteCompatible();
  const database = await getDatabase();
  await enforceStorageBudget(database, chunk.size);
  const transaction = database.transaction([mediaStoreName, recordingChunkStoreName], 'readwrite');
  const mediaStore = transaction.objectStore(mediaStoreName);
  const chunkStore = transaction.objectStore(recordingChunkStoreName);
  const storedItem = await mediaStore.get(recordingId);

  if (storedItem === undefined || storedItem.kind !== 'chunked-recording') {
    throw new Error('Recording session metadata is unavailable for chunk persistence.');
  }

  await chunkStore.put({
    blob: chunk,
    recordingId,
    sequence,
    sizeBytes: chunk.size,
  });
  await mediaStore.put({
    ...storedItem,
    chunkCount: Math.max(storedItem.chunkCount, sequence + 1),
    sizeBytes: storedItem.sizeBytes + chunk.size,
  });
  await transaction.done;
  markCurrentClientWrite();
}

export async function finalizeChunkedRecordingMedia(
  recordingId: string,
  finalMetadata: {
    readonly durationMs: number;
    readonly timestamp: number;
  },
): Promise<void> {
  assertStorageWriteCompatible();
  const database = await getDatabase();
  const storedItem = await database.get(mediaStoreName, recordingId);

  if (storedItem === undefined || storedItem.kind !== 'chunked-recording') {
    throw new Error('Recording session metadata is unavailable for finalization.');
  }

  await database.put(mediaStoreName, {
    ...storedItem,
    durationMs: finalMetadata.durationMs,
    timestamp: finalMetadata.timestamp,
  });
  markCurrentClientWrite();
}

export async function discardChunkedRecordingMedia(recordingId: string): Promise<void> {
  assertStorageWriteCompatible();
  const database = await getDatabase();
  const transaction = database.transaction([mediaStoreName, recordingChunkStoreName], 'readwrite');
  const chunkStore = transaction.objectStore(recordingChunkStoreName);
  const chunkKeys = await chunkStore.getAllKeys(IDBKeyRange.bound([recordingId, 0], [recordingId, Number.MAX_SAFE_INTEGER]));

  await Promise.all(
    chunkKeys.map((chunkKey): Promise<void> => chunkStore.delete(chunkKey)),
  );
  await transaction.objectStore(mediaStoreName).delete(recordingId);
  await transaction.done;
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
    availability: 'available',
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

export async function getMediaPlaybackHandle(id: string): Promise<MediaPlaybackHandle | null> {
  const database = await getDatabase();
  const storedItem = await database.get(mediaStoreName, id);

  if (storedItem === undefined) {
    return null;
  }

  if ('kind' in storedItem && storedItem.kind === 'chunked-recording') {
    return createChunkedPlaybackHandle(storedItem);
  }

  const mediaItem = await resolveStoredMediaItem(storedItem, 'strict');

  if (mediaItem === null) {
    return null;
  }

  return createObjectUrlHandle(mediaItem, mediaItem.blob);
}

export async function downloadMediaById(id: string): Promise<boolean> {
  const database = await getDatabase();
  const storedItem = await database.get(mediaStoreName, id);

  if (storedItem === undefined) {
    return false;
  }

  const globalScope = globalThis as typeof globalThis & {
    showSaveFilePicker?: (options?: {
      excludeAcceptAllOption?: boolean;
      suggestedName?: string;
      types?: Array<{
        accept: Record<string, string[]>;
        description: string;
      }>;
    }) => Promise<{
      createWritable: () => Promise<{
        close: () => Promise<void>;
        write: (data: Blob | BufferSource | string) => Promise<void>;
      }>;
    }>;
  };

  if (
    'kind' in storedItem &&
    storedItem.kind === 'chunked-recording' &&
    typeof globalScope.showSaveFilePicker === 'function'
  ) {
    const fileHandle = await globalScope.showSaveFilePicker({
      excludeAcceptAllOption: false,
      suggestedName: storedItem.name,
      types: [
        {
          accept: {
            [storedItem.mimeType]: ['.webm'],
          },
          description: 'Auteura video export',
        },
      ],
    });
    const writable = await fileHandle.createWritable();

    try {
      for (const chunkKey of await listRecordingChunkKeys(database, id)) {
        const chunkItem = await database.get(recordingChunkStoreName, chunkKey);

        if (chunkItem === undefined) {
          continue;
        }

        await writable.write(chunkItem.blob);
      }
    } finally {
      await writable.close();
    }

    return true;
  }

  const mediaItem = await resolveStoredMediaItem(storedItem, 'strict');

  if (mediaItem === null) {
    return false;
  }

  const objectUrl = URL.createObjectURL(mediaItem.blob);
  const linkElement = document.createElement('a');
  linkElement.href = objectUrl;
  linkElement.download = mediaItem.name;
  linkElement.style.display = 'none';
  document.body.appendChild(linkElement);
  linkElement.click();
  document.body.removeChild(linkElement);

  window.setTimeout((): void => {
    URL.revokeObjectURL(objectUrl);
  }, 0);

  return true;
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
  const transaction = database.transaction(
    [mediaStoreName, mediaBlobStoreName, recordingChunkStoreName],
    'readwrite',
  );

  if (storedItem?.kind === 'chunked-recording') {
    const chunkStore = transaction.objectStore(recordingChunkStoreName);
    const chunkKeys = await chunkStore.getAllKeys(
      IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]),
    );
    await Promise.all(
      chunkKeys.map((chunkKey: [string, number]): Promise<void> => chunkStore.delete(chunkKey)),
    );
  }

  if (storedItem?.kind === 'copied-indexeddb') {
    await transaction.objectStore(mediaBlobStoreName).delete(id);
  }

  await transaction.objectStore(mediaStoreName).delete(id);
  await transaction.done;
  markCurrentClientWrite();
}

export async function clearAll(): Promise<void> {
  assertStorageWriteCompatible();
  const database = await getDatabase();
  const transaction = database.transaction(
    [mediaStoreName, mediaBlobStoreName, recordingChunkStoreName],
    'readwrite',
  );
  await transaction.objectStore(mediaStoreName).clear();
  await transaction.objectStore(mediaBlobStoreName).clear();
  await transaction.objectStore(recordingChunkStoreName).clear();
  await transaction.done;
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
  const {
    copiedItemCount,
    handleBackedItemCount,
    itemCount,
    referencedBytes,
    usageBytes,
  } = await reduceStoredMediaItems(
    database,
    (
      stats: {
        copiedItemCount: number;
        handleBackedItemCount: number;
        itemCount: number;
        referencedBytes: number;
        usageBytes: number;
      },
      item: LegacyStoredMediaItem,
    ) => {
      stats.itemCount += 1;
      stats.usageBytes += calculateStoredRecordBudgetBytes(item);

      if (item.kind === 'file-handle') {
        stats.handleBackedItemCount += 1;
        stats.referencedBytes += item.sizeBytes;
      } else {
        stats.copiedItemCount += 1;
      }

      return stats;
    },
    {
      copiedItemCount: 0,
      handleBackedItemCount: 0,
      itemCount: 0,
      referencedBytes: 0,
      usageBytes: 0,
    },
  );
  const { maxAllowedBytes, quotaBytes } = await getStorageBudget();

  return {
    copiedItemCount,
    handleBackedItemCount,
    itemCount,
    maxAllowedBytes,
    quotaBytes,
    referencedBytes,
    usageBytes,
  };
}
