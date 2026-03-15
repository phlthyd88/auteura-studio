import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDB, type DBSchema } from 'idb';
import {
  appendChunkedRecordingMediaChunk,
  clearAll,
  createChunkedRecordingMedia,
  deleteMedia,
  finalizeChunkedRecordingMedia,
  getAllMedia,
  getMediaById,
  getMediaStorageStats,
  resetMediaDatabase,
  saveImportedMedia,
  saveMedia,
  type MediaItem,
} from '../MediaStorageService';
import type { PreparedImportedMedia } from '../../types/importedMedia';

interface LegacyMediaDatabaseSchema extends DBSchema {
  media: {
    indexes: {
      kind: 'blob';
      timestamp: number;
      type: 'image' | 'video';
    };
    key: string;
    value: {
      readonly blob: Blob;
      readonly captureMode: 'recording';
      readonly createdAt: number;
      readonly id: string;
      readonly kind: 'blob';
      readonly mimeType: string;
      readonly name: string;
      readonly origin: 'capture';
      readonly sizeBytes: number;
      readonly timestamp: number;
      readonly type: 'video';
    };
  };
  recordingChunks: {
    indexes: {
      recordingId: string;
    };
    key: [string, number];
    value: {
      readonly blob: Blob;
      readonly recordingId: string;
      readonly sequence: number;
      readonly sizeBytes: number;
    };
  };
}

interface MigrationVerificationDatabaseSchema extends DBSchema {
  media: {
    key: string;
    value: {
      readonly id: string;
      readonly kind: 'copied-indexeddb';
    };
  };
  mediaBlobs: {
    key: string;
    value: {
      readonly blob: Blob;
      readonly mediaId: string;
    };
  };
  migrationAudit: {
    key: string;
    value: {
      readonly fromVersion: number;
      readonly id: string;
      readonly migratedBlobCount: number;
      readonly migratedBytes: number;
      readonly recordSetChecksum: string;
      readonly verifiedBlobCount: number;
    };
  };
}

function createMediaItem(overrides: Partial<MediaItem> = {}): MediaItem {
  const timestamp = overrides.timestamp ?? Date.now();

  return {
    blob: overrides.blob ?? new Blob(['auteura-test'], { type: 'video/webm' }),
    captureMode: overrides.captureMode ?? 'recording',
    createdAt: overrides.createdAt ?? timestamp,
    durationMs: overrides.durationMs ?? 1_500,
    height: overrides.height ?? 720,
    id: overrides.id ?? crypto.randomUUID(),
    isAvailable: overrides.isAvailable ?? true,
    mimeType: overrides.mimeType ?? 'video/webm',
    name: overrides.name ?? `recording-${timestamp}.webm`,
    origin: overrides.origin ?? 'capture',
    sizeBytes: overrides.sizeBytes ?? 12,
    storageKind: overrides.storageKind ?? 'copied-indexeddb',
    ...(overrides.thumbnail === undefined ? {} : { thumbnail: overrides.thumbnail }),
    timestamp,
    type: overrides.type ?? 'video',
    width: overrides.width ?? 1280,
  };
}

function createImportedMedia(
  overrides: Partial<PreparedImportedMedia> = {},
): PreparedImportedMedia {
  const file = overrides.file ?? new File(['imported-video'], 'imported.mp4', { type: 'video/mp4' });
  const timestamp = overrides.timestamp ?? Date.now();

  return {
    file,
    fileHandle:
      overrides.fileHandle ??
      ({
        kind: 'file',
        name: file.name,
        getFile: (): Promise<File> => Promise.resolve(file),
      } as const),
    importStrategy: overrides.importStrategy ?? 'file-system-handle',
    mimeType: overrides.mimeType ?? file.type,
    name: overrides.name ?? file.name,
    sizeBytes: overrides.sizeBytes ?? file.size,
    timestamp,
    type: overrides.type ?? 'video',
    ...(overrides.durationMs === undefined ? {} : { durationMs: overrides.durationMs }),
    ...(overrides.width === undefined ? {} : { width: overrides.width }),
    ...(overrides.height === undefined ? {} : { height: overrides.height }),
    ...(overrides.thumbnail === undefined ? {} : { thumbnail: overrides.thumbnail }),
  };
}

function mockStorageEstimate(quota: number, usage = 0): void {
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: {
      estimate: (): Promise<{ quota: number; usage: number }> =>
        Promise.resolve({
          quota,
          usage,
        }),
    },
  });
}

describe('MediaStorageService', (): void => {
  const originalStorage = navigator.storage;

  beforeEach(async (): Promise<void> => {
    await resetMediaDatabase();
  });

  afterEach(async (): Promise<void> => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: originalStorage,
    });
    await resetMediaDatabase();
  });

  it('persists and returns newest-first media items', async (): Promise<void> => {
    const olderItem = createMediaItem({
      id: 'old',
      timestamp: 100,
    });
    const newerItem = createMediaItem({
      id: 'new',
      timestamp: 200,
    });

    await saveMedia(olderItem);
    await saveMedia(newerItem);

    const listedItems = await getAllMedia();

    expect(listedItems.map((item): string => item.id)).toEqual(['new', 'old']);
    expect(listedItems[0]?.blob.size).toBe(0);
    expect(listedItems[1]?.blob.size).toBe(0);
    expect(listedItems[0]?.sizeBytes).toBe(newerItem.sizeBytes);
    expect(listedItems[1]?.sizeBytes).toBe(olderItem.sizeBytes);

    await expect(getMediaById('new')).resolves.toEqual(newerItem);
    await expect(getMediaById('old')).resolves.toEqual(olderItem);
  });

  it('deletes individual items and clears the library', async (): Promise<void> => {
    const mediaItem = createMediaItem({
      id: 'delete-me',
    });

    await saveMedia(mediaItem);
    await deleteMedia(mediaItem.id);
    await expect(getAllMedia()).resolves.toEqual([]);

    await saveMedia(mediaItem);
    await clearAll();
    await expect(getAllMedia()).resolves.toEqual([]);
  });

  it('reports storage stats for saved items', async (): Promise<void> => {
    await saveMedia(
      createMediaItem({
        id: 'stats',
        sizeBytes: 1024,
      }),
    );

    const stats = await getMediaStorageStats();

    expect(stats.itemCount).toBe(1);
    expect(stats.copiedItemCount).toBe(1);
    expect(stats.handleBackedItemCount).toBe(0);
    expect(stats.usageBytes).toBe(1024);
  });

  it('persists chunked recordings without requiring an in-memory final blob', async (): Promise<void> => {
    await createChunkedRecordingMedia({
      captureMode: 'recording',
      createdAt: 100,
      height: 720,
      id: 'chunked-recording',
      mimeType: 'video/webm',
      name: 'chunked-recording.webm',
      origin: 'capture',
      timestamp: 100,
      type: 'video',
      width: 1280,
    });
    await appendChunkedRecordingMediaChunk(
      'chunked-recording',
      0,
      new Blob(['chunk-a'], { type: 'video/webm' }),
    );
    await appendChunkedRecordingMediaChunk(
      'chunked-recording',
      1,
      new Blob(['chunk-b'], { type: 'video/webm' }),
    );
    await finalizeChunkedRecordingMedia('chunked-recording', {
      durationMs: 2_000,
      timestamp: 200,
    });

    const listedItems = await getAllMedia();
    const resolvedItem = await getMediaById('chunked-recording');

    expect(listedItems).toHaveLength(1);
    expect(listedItems[0]?.id).toBe('chunked-recording');
    expect(listedItems[0]?.blob.size).toBe(0);
    expect(listedItems[0]?.sizeBytes).toBe(14);
    expect(resolvedItem?.blob.size).toBe(14);
    await expect(resolvedItem?.blob.text()).resolves.toBe('chunk-achunk-b');
  });

  it('persists imported handle references without counting them against copied storage', async (): Promise<void> => {
    await saveImportedMedia(
      createImportedMedia({
        sizeBytes: 4_096,
      }),
    );

    const mediaItems = await getAllMedia();
    const stats = await getMediaStorageStats();

    expect(mediaItems).toHaveLength(1);
    expect(mediaItems[0]?.storageKind).toBe('file-system-handle');
    expect(mediaItems[0]?.origin).toBe('imported');
    expect(mediaItems[0]?.isAvailable).toBe(true);
    expect(stats.handleBackedItemCount).toBe(1);
    expect(stats.referencedBytes).toBe(4_096);
    expect(stats.usageBytes).toBe(0);
  });

  it('returns null from getMediaById when a linked import can no longer be read', async (): Promise<void> => {
    await saveImportedMedia(
      createImportedMedia({
        fileHandle: {
          kind: 'file',
          name: 'missing.mp4',
          getFile: (): Promise<File> => Promise.reject(new Error('missing')),
        },
        name: 'missing.mp4',
      }),
    );

    const listedItems = await getAllMedia();
    const resolvedItem = await getMediaById(listedItems[0]!.id);

    expect(listedItems[0]?.isAvailable).toBe(false);
    expect(resolvedItem).toBeNull();
  });

  it('lists a 1GB logical copied-media library without hydrating payload blobs', async (): Promise<void> => {
    const totalItems = 256;
    const logicalItemBytes = 4 * 1024 * 1024;
    const sharedBlob = new Blob(['x'], { type: 'video/webm' });
    const seededDatabase = await openDB('AuteuraDB', 6, {
      upgrade(database): void {
        const mediaStore = database.createObjectStore('media', {
          keyPath: 'id',
        });
        mediaStore.createIndex('timestamp', 'timestamp');
        mediaStore.createIndex('type', 'type');
        mediaStore.createIndex('kind', 'kind');
        database.createObjectStore('mediaBlobs', {
          keyPath: 'mediaId',
        });
        database.createObjectStore('migrationAudit', {
          keyPath: 'id',
        });
        const recordingChunkStore = database.createObjectStore('recordingChunks', {
          keyPath: ['recordingId', 'sequence'],
        });
        recordingChunkStore.createIndex('recordingId', 'recordingId');
      },
    });

    const transaction = seededDatabase.transaction(['media', 'mediaBlobs'], 'readwrite');

    for (let index = 0; index < totalItems; index += 1) {
      await transaction.objectStore('media').put({
        captureMode: 'recording',
        createdAt: index,
        id: `pressure-item-${index}`,
        kind: 'copied-indexeddb',
        mimeType: 'video/webm',
        name: `pressure-item-${index}.webm`,
        origin: 'capture',
        sizeBytes: logicalItemBytes,
        timestamp: index,
        type: 'video',
      });
      await transaction.objectStore('mediaBlobs').put({
        blob: sharedBlob,
        mediaId: `pressure-item-${index}`,
      });
    }

    await transaction.done;
    seededDatabase.close();

    const listStartedAt = performance.now();
    const listedItems = await getAllMedia();
    const listDurationMs = performance.now() - listStartedAt;

    const statsStartedAt = performance.now();
    const stats = await getMediaStorageStats();
    const statsDurationMs = performance.now() - statsStartedAt;

    expect(listedItems).toHaveLength(totalItems);
    expect(listedItems.every((item): boolean => item.blob.size === 0)).toBe(true);
    expect(listedItems.every((item): boolean => item.sizeBytes === logicalItemBytes)).toBe(true);
    expect(stats.itemCount).toBe(totalItems);
    expect(stats.copiedItemCount).toBe(totalItems);
    expect(stats.usageBytes).toBe(totalItems * logicalItemBytes);
    expect(listDurationMs).toBeLessThan(250);
    expect(statsDurationMs).toBeLessThan(250);
  });

  it('keeps fragmented chunked recordings metadata-only in library paths under pressure', async (): Promise<void> => {
    await createChunkedRecordingMedia({
      captureMode: 'recording',
      createdAt: 100,
      height: 720,
      id: 'pressure-recording',
      mimeType: 'video/webm',
      name: 'pressure-recording.webm',
      origin: 'capture',
      timestamp: 100,
      type: 'video',
      width: 1280,
    });

    for (let sequence = 0; sequence < 512; sequence += 1) {
      await appendChunkedRecordingMediaChunk(
        'pressure-recording',
        sequence,
        new Blob([`chunk-${sequence.toString().padStart(4, '0')}`], {
          type: 'video/webm',
        }),
      );
    }

    await finalizeChunkedRecordingMedia('pressure-recording', {
      durationMs: 60_000,
      timestamp: 200,
    });

    const listedItems = await getAllMedia();
    const stats = await getMediaStorageStats();
    const resolvedItem = await getMediaById('pressure-recording');

    expect(listedItems).toHaveLength(1);
    expect(listedItems[0]?.blob.size).toBe(0);
    expect(listedItems[0]?.sizeBytes).toBeGreaterThan(0);
    expect(stats.itemCount).toBe(1);
    expect(stats.usageBytes).toBe(listedItems[0]?.sizeBytes ?? 0);
    expect(resolvedItem?.blob.size).toBeGreaterThan(0);
  });

  it('rejects quota-exhausting imports without corrupting the existing library', async (): Promise<void> => {
    await saveMedia(
      createMediaItem({
        id: 'keep-existing',
        sizeBytes: 8,
      }),
    );

    mockStorageEstimate(50);

    await expect(
      saveMedia(
        createMediaItem({
          id: 'too-large',
          sizeBytes: 40,
        }),
      ),
    ).rejects.toThrow('The import exceeds the current browser storage budget.');

    const mediaItems = await getAllMedia();
    expect(mediaItems).toHaveLength(1);
    expect(mediaItems[0]?.id).toBe('keep-existing');
  });

  it('verifies legacy blob migration before completing the split-store upgrade', async (): Promise<void> => {
    const legacyDatabase = await openDB<LegacyMediaDatabaseSchema>('AuteuraDB', 4, {
      upgrade(database): void {
        const mediaStore = database.createObjectStore('media', {
          keyPath: 'id',
        });
        mediaStore.createIndex('timestamp', 'timestamp');
        mediaStore.createIndex('type', 'type');
        mediaStore.createIndex('kind', 'kind');

        const recordingChunkStore = database.createObjectStore('recordingChunks', {
          keyPath: ['recordingId', 'sequence'],
        });
        recordingChunkStore.createIndex('recordingId', 'recordingId');
      },
    });

    await legacyDatabase.put('media', {
      blob: new Blob(['legacy-recording-payload'], { type: 'video/webm' }),
      captureMode: 'recording',
      createdAt: 100,
      id: 'legacy-recording',
      kind: 'blob',
      mimeType: 'video/webm',
      name: 'legacy-recording.webm',
      origin: 'capture',
      sizeBytes: 24,
      timestamp: 100,
      type: 'video',
    });
    legacyDatabase.close();

    const listedItems = await getAllMedia();
    const resolvedItem = await getMediaById('legacy-recording');
    const upgradedDatabase = await openDB<MigrationVerificationDatabaseSchema>('AuteuraDB');

    const migrationAudit = await upgradedDatabase.get('migrationAudit', 'media-split-v5');
    const migratedMetadata = await upgradedDatabase.get('media', 'legacy-recording');
    const migratedBlobRecord = await upgradedDatabase.get('mediaBlobs', 'legacy-recording');
    upgradedDatabase.close();

    expect(listedItems).toHaveLength(1);
    expect(listedItems[0]?.id).toBe('legacy-recording');
    expect(listedItems[0]?.blob.size).toBe(0);
    await expect(resolvedItem?.blob.text()).resolves.toBe('legacy-recording-payload');
    expect(migratedMetadata).toMatchObject({
      id: 'legacy-recording',
      kind: 'copied-indexeddb',
    });
    expect(migratedBlobRecord?.blob.size).toBe(24);
    expect(migrationAudit).toMatchObject({
      fromVersion: 4,
      id: 'media-split-v5',
      migratedBlobCount: 1,
      migratedBytes: 24,
      verifiedBlobCount: 1,
    });
    expect(migrationAudit?.recordSetChecksum).toMatch(/^fnv1a-[0-9a-f]{8}$/);
  });
});
