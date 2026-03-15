import { getMediaById } from './MediaStorageService';

export interface WaveformDecoderContext {
  decodeAudioData: (audioData: ArrayBuffer) => Promise<AudioBuffer>;
}

export interface WaveformAnalysisOptions {
  readonly normalize?: boolean;
  readonly resolution?: number;
}

export interface WaveformSummary {
  readonly channelCount: number;
  readonly durationSeconds: number;
  readonly mediaId: string;
  readonly peaks: Float32Array;
  readonly resolution: number;
  readonly sampleRate: number;
}

const minimumWaveformResolution = 32;
const defaultWaveformResolution = 256;
const maximumWaveformResolution = 2048;

function clampResolution(resolution: number | undefined): number {
  if (resolution === undefined || !Number.isFinite(resolution)) {
    return defaultWaveformResolution;
  }

  return Math.max(
    minimumWaveformResolution,
    Math.min(maximumWaveformResolution, Math.floor(resolution)),
  );
}

function buildAnalysisCacheKey(
  mediaId: string,
  normalizedResolution: number,
  normalize: boolean,
): string {
  return `${mediaId}:${normalizedResolution}:${normalize ? 'normalized' : 'raw'}`;
}

function summarizeAudioBuffer(
  mediaId: string,
  audioBuffer: AudioBuffer,
  resolution: number,
  normalize: boolean,
): WaveformSummary {
  const bucketCount = Math.max(1, clampResolution(resolution));
  const channelCount = Math.max(1, audioBuffer.numberOfChannels);
  const sampleLength = audioBuffer.length;
  const samplesPerBucket = Math.max(1, Math.ceil(sampleLength / bucketCount));
  const peaks = new Float32Array(bucketCount * 2);

  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
    const bucketStart = bucketIndex * samplesPerBucket;
    const bucketEnd = Math.min(sampleLength, bucketStart + samplesPerBucket);
    let minimumSample = 1;
    let maximumSample = -1;

    if (bucketStart >= bucketEnd) {
      peaks[bucketIndex * 2] = 0;
      peaks[bucketIndex * 2 + 1] = 0;
      continue;
    }

    for (let sampleIndex = bucketStart; sampleIndex < bucketEnd; sampleIndex += 1) {
      let mixedSample = 0;

      for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
        mixedSample += audioBuffer.getChannelData(channelIndex)[sampleIndex] ?? 0;
      }

      mixedSample /= channelCount;
      minimumSample = Math.min(minimumSample, mixedSample);
      maximumSample = Math.max(maximumSample, mixedSample);
    }

    peaks[bucketIndex * 2] = minimumSample;
    peaks[bucketIndex * 2 + 1] = maximumSample;
  }

  if (normalize) {
    let maximumMagnitude = 0;

    for (let peakIndex = 0; peakIndex < peaks.length; peakIndex += 1) {
      maximumMagnitude = Math.max(maximumMagnitude, Math.abs(peaks[peakIndex] ?? 0));
    }

    if (maximumMagnitude > 0) {
      const normalizationFactor = 1 / maximumMagnitude;

      for (let peakIndex = 0; peakIndex < peaks.length; peakIndex += 1) {
        peaks[peakIndex] = (peaks[peakIndex] ?? 0) * normalizationFactor;
      }
    }
  }

  return {
    channelCount,
    durationSeconds: audioBuffer.duration,
    mediaId,
    peaks,
    resolution: bucketCount,
    sampleRate: audioBuffer.sampleRate,
  };
}

export class WaveformAnalysisService {
  private readonly analysisCache = new Map<string, Promise<WaveformSummary | null>>();

  private readonly inFlightDecodeCache = new Map<string, Promise<AudioBuffer | null>>();

  public constructor(private readonly decoderContext: WaveformDecoderContext) {}

  async getWaveform(
    mediaId: string,
    options: WaveformAnalysisOptions = {},
  ): Promise<WaveformSummary | null> {
    const normalizedResolution = clampResolution(options.resolution);
    const normalize = options.normalize ?? true;
    const cacheKey = buildAnalysisCacheKey(mediaId, normalizedResolution, normalize);
    const cachedAnalysis = this.analysisCache.get(cacheKey);

    if (cachedAnalysis !== undefined) {
      return cachedAnalysis;
    }

    const analysisPromise = (async (): Promise<WaveformSummary | null> => {
      const decodedBuffer = await this.getDecodedBuffer(mediaId);

      if (decodedBuffer === null) {
        return null;
      }

      return summarizeAudioBuffer(mediaId, decodedBuffer, normalizedResolution, normalize);
    })();

    this.analysisCache.set(cacheKey, analysisPromise);

    try {
      return await analysisPromise;
    } catch (error: unknown) {
      this.analysisCache.delete(cacheKey);
      throw error instanceof Error
        ? error
        : new Error('Waveform analysis failed.');
    }
  }

  async prefetchWaveforms(
    mediaIds: readonly string[],
    options: WaveformAnalysisOptions = {},
  ): Promise<void> {
    const uniqueMediaIds = [...new Set(mediaIds)];
    await Promise.all(
      uniqueMediaIds.map(async (mediaId: string): Promise<void> => {
        await this.getWaveform(mediaId, options);
      }),
    );
  }

  clearAnalysisCache(): void {
    this.analysisCache.clear();
  }

  clearAllCaches(): void {
    this.analysisCache.clear();
    this.inFlightDecodeCache.clear();
  }

  private async getDecodedBuffer(mediaId: string): Promise<AudioBuffer | null> {
    const cachedBuffer = this.inFlightDecodeCache.get(mediaId);

    if (cachedBuffer !== undefined) {
      return cachedBuffer;
    }

    const decodedBufferPromise = (async (): Promise<AudioBuffer | null> => {
      const mediaItem = await getMediaById(mediaId);

      if (mediaItem === null) {
        return null;
      }

      try {
        const audioData = await mediaItem.blob.arrayBuffer();
        return await this.decoderContext.decodeAudioData(audioData.slice(0));
      } catch {
        return null;
      }
    })();

    this.inFlightDecodeCache.set(mediaId, decodedBufferPromise);

    try {
      return await decodedBufferPromise;
    } catch (error: unknown) {
      throw error instanceof Error
        ? error
        : new Error('Audio decoding failed.');
    } finally {
      this.inFlightDecodeCache.delete(mediaId);
    }
  }
}
