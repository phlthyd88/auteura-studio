import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type MediaItem } from '../MediaStorageService';
import { WaveformAnalysisService } from '../WaveformAnalysisService';

const getMediaByIdMock = vi.fn<(mediaId: string) => Promise<MediaItem | null>>();

vi.mock('../MediaStorageService', () => ({
  getMediaById: (mediaId: string): Promise<MediaItem | null> => getMediaByIdMock(mediaId),
}));

function createMediaItem(id: string): MediaItem {
  const timestamp = 1000;

  return {
    availability: 'available',
    blob: new Blob(['waveform-test'], { type: 'audio/webm' }),
    captureMode: 'recording',
    createdAt: timestamp,
    id,
    isAvailable: true,
    mimeType: 'audio/webm',
    name: `${id}.webm`,
    origin: 'capture',
    sizeBytes: 128,
    storageKind: 'copied-indexeddb',
    timestamp,
    type: 'video',
  };
}

function createAudioBuffer(
  channels: readonly Float32Array[],
  sampleRate = 48_000,
): AudioBuffer {
  const length = channels[0]?.length ?? 0;

  return {
    duration: length / sampleRate,
    getChannelData: (channelIndex: number): Float32Array => channels[channelIndex] ?? new Float32Array(),
    length,
    numberOfChannels: channels.length,
    sampleRate,
  } as AudioBuffer;
}

describe('WaveformAnalysisService', (): void => {
  beforeEach((): void => {
    getMediaByIdMock.mockReset();
  });

  it('builds a compact normalized waveform summary', async (): Promise<void> => {
    getMediaByIdMock.mockResolvedValue(createMediaItem('media-a'));
    const decodeAudioData = vi.fn((): Promise<AudioBuffer> =>
      Promise.resolve(
        createAudioBuffer([new Float32Array([0, -0.5, 1, -1, 0.25, -0.25, 0.5, -0.75])]),
      ),
    );
    const service = new WaveformAnalysisService({
      decodeAudioData,
    });

    const waveform = await service.getWaveform('media-a', {
      normalize: true,
      resolution: 4,
    });

    expect(waveform?.mediaId).toBe('media-a');
    expect(waveform?.resolution).toBe(32);
    expect(Array.from(waveform?.peaks ?? [])).toHaveLength(64);
    expect(Math.min(...Array.from(waveform?.peaks ?? []))).toBeGreaterThanOrEqual(-1);
    expect(Math.max(...Array.from(waveform?.peaks ?? []))).toBeLessThanOrEqual(1);
  });

  it('reuses cached summaries for identical analysis requests', async (): Promise<void> => {
    getMediaByIdMock.mockResolvedValue(createMediaItem('media-b'));
    const decodeAudioData = vi.fn((): Promise<AudioBuffer> =>
      Promise.resolve(createAudioBuffer([new Float32Array([0.1, -0.1, 0.4, -0.4])])),
    );
    const service = new WaveformAnalysisService({
      decodeAudioData,
    });

    const firstSummary = await service.getWaveform('media-b', {
      resolution: 64,
    });
    const secondSummary = await service.getWaveform('media-b', {
      resolution: 64,
    });

    expect(firstSummary).toBe(secondSummary);
    expect(decodeAudioData).toHaveBeenCalledTimes(1);
  });

  it('re-decodes media when waveform options change so raw buffers are not retained', async (): Promise<void> => {
    getMediaByIdMock.mockResolvedValue(createMediaItem('media-c'));
    const decodeAudioData = vi.fn((): Promise<AudioBuffer> =>
      Promise.resolve(createAudioBuffer([new Float32Array([0.2, -0.2, 0.6, -0.6])])),
    );
    const service = new WaveformAnalysisService({
      decodeAudioData,
    });

    await service.getWaveform('media-c', {
      resolution: 64,
    });
    await service.getWaveform('media-c', {
      resolution: 128,
    });

    expect(decodeAudioData).toHaveBeenCalledTimes(2);
  });
});
