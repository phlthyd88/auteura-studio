import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaItem } from '../MediaStorageService';
import { LruDecodedAudioBufferCache } from '../DecodedAudioBufferCache';
import { TimelineAudioEngine } from '../TimelineAudioEngine';

const getMediaByIdMock = vi.fn<(mediaId: string) => Promise<MediaItem | null>>();

vi.mock('../MediaStorageService', () => ({
  getMediaById: (mediaId: string): Promise<MediaItem | null> => getMediaByIdMock(mediaId),
}));

function createMediaItem(id: string): MediaItem {
  const timestamp = 1000;

  return {
    blob: new Blob([id], { type: 'audio/webm' }),
    captureMode: 'recording',
    createdAt: timestamp,
    id,
    isAvailable: true,
    mimeType: 'audio/webm',
    name: `${id}.webm`,
    origin: 'capture',
    sizeBytes: id.length,
    storageKind: 'copied-indexeddb',
    timestamp,
    type: 'video',
  };
}

function createAudioBuffer(length: number, numberOfChannels: number): AudioBuffer {
  return {
    copyFromChannel: (): void => undefined,
    copyToChannel: (): void => undefined,
    duration: length / 48_000,
    getChannelData: (): Float32Array => new Float32Array(length),
    length,
    numberOfChannels,
    sampleRate: 48_000,
  } as unknown as AudioBuffer;
}

function createAudioContextMock(
  decodeAudioData: (audioData: ArrayBuffer) => Promise<AudioBuffer | null>,
): AudioContext {
  return {
    decodeAudioData,
    destination: {} as AudioDestinationNode,
  } as AudioContext;
}

describe('TimelineAudioEngine', (): void => {
  beforeEach((): void => {
    getMediaByIdMock.mockReset();
  });

  it('reuses cached decoded buffers for repeated media requests', async (): Promise<void> => {
    getMediaByIdMock.mockResolvedValue(createMediaItem('media-a'));
    const decodeAudioData = vi.fn((): Promise<AudioBuffer> => Promise.resolve(createAudioBuffer(8, 2)));
    const engine = new TimelineAudioEngine({
      audioContext: createAudioContextMock(decodeAudioData),
    });

    const firstBuffer = await engine.getDecodedBuffer('media-a');
    const secondBuffer = await engine.getDecodedBuffer('media-a');

    expect(firstBuffer).toBe(secondBuffer);
    expect(getMediaByIdMock).toHaveBeenCalledTimes(1);
    expect(decodeAudioData).toHaveBeenCalledTimes(1);
  });

  it('evicts least-recently-used decoded buffers when the cache exceeds its byte budget', async (): Promise<void> => {
    getMediaByIdMock.mockImplementation((mediaId: string): Promise<MediaItem> =>
      Promise.resolve(createMediaItem(mediaId)),
    );
    const decodeAudioData = vi.fn(
      (audioData: ArrayBuffer): Promise<AudioBuffer> => {
        const mediaId = new TextDecoder().decode(audioData);

        if (mediaId === 'media-a' || mediaId === 'media-b' || mediaId === 'media-c') {
          return Promise.resolve(createAudioBuffer(4, 2));
        }

        return Promise.reject(new Error(`Unexpected media id ${mediaId}.`));
      },
    );
    const engine = new TimelineAudioEngine({
      audioContext: createAudioContextMock(decodeAudioData),
      decodedBufferCache: new LruDecodedAudioBufferCache(80),
    });

    await engine.getDecodedBuffer('media-a');
    await engine.getDecodedBuffer('media-b');
    await engine.getDecodedBuffer('media-a');
    await engine.getDecodedBuffer('media-c');
    await engine.getDecodedBuffer('media-a');
    await engine.getDecodedBuffer('media-b');

    expect(decodeAudioData).toHaveBeenCalledTimes(4);
    expect(getMediaByIdMock).toHaveBeenCalledTimes(4);
  });
});
