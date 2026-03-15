import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearAll,
  deleteMedia,
  getAllMedia,
  getMediaById,
  getMediaStorageStats,
  resetMediaDatabase,
  saveImportedMedia,
  saveMedia,
  type MediaItem,
} from '../MediaStorageService';
import type { PreparedImportedMedia } from '../../types/importedMedia';

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

    await expect(getAllMedia()).resolves.toEqual([newerItem, olderItem]);
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

  it('rejects quota-exhausting imports without corrupting the existing library', async (): Promise<void> => {
    await saveMedia(
      createMediaItem({
        id: 'keep-existing',
        sizeBytes: 8,
      }),
    );

    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        estimate: (): Promise<{ quota: number; usage: number }> =>
          Promise.resolve({
            quota: 50,
            usage: 0,
          }),
      },
    });

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
});
