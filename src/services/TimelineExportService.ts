import { composeTimelineFrame } from './TimelineCompositor';
import { getMediaById, type MediaItem } from './MediaStorageService';
import type {
  TimelineAudioCompositionInstruction,
  TimelineProject,
} from '../models/Timeline';
import { getTopTimelineCompositionLayer } from '../types/compositor';
import { createStudioRenderer } from '../engine/createStudioRenderer';
import { CompositionRenderAdapter } from '../engine/render/CompositionRenderAdapter';
import { defaultBeautyRuntimeState } from '../types/beauty';
import { defaultColorGradingSettings, defaultTransformSettings } from '../types/color';
import { defaultPictureInPictureConfig } from '../types/compositor';
import {
  composeTimelinePlaybackAudioInstructions,
} from './TimelineCompositionEngine';
import { TimelineAudioEngine } from './TimelineAudioEngine';
import {
  defaultRenderComparisonConfig,
  defaultRenderMaskRefinementConfig,
  RenderMode,
} from '../types/render';

export interface TimelineExportProgress {
  readonly elapsedMs: number;
  readonly fraction: number;
  readonly playheadMs: number;
}

export interface TimelineExportOptions {
  readonly fps?: number;
  readonly onProgress?: (progress: TimelineExportProgress) => void;
  readonly project: TimelineProject;
  readonly signal?: AbortSignal;
  readonly videoBitsPerSecond?: number;
}

interface PreparedTimelineSource {
  readonly item: MediaItem;
  readonly objectUrl: string;
  readonly sourceElement: HTMLImageElement | HTMLVideoElement;
}

interface PreparedExportAudio {
  readonly audioContext: AudioContext;
  readonly audioEngine: TimelineAudioEngine;
  readonly anchorSeconds: number;
  readonly destinationNode: MediaStreamAudioDestinationNode;
}

interface PreparedOfflineExportAudio {
  readonly durationMs: number;
  readonly sampleRate: number;
}

interface GeneratedTrackLike<TFrame> {
  readonly writable: WritableStream<TFrame>;
  stop?: () => void;
}

interface GeneratedTrackSupport {
  readonly AudioDataCtor: new (init: {
    readonly data: BufferSource;
    readonly format: 'f32-planar';
    readonly numberOfChannels: number;
    readonly numberOfFrames: number;
    readonly sampleRate: number;
    readonly timestamp: number;
  }) => { close(): void };
  readonly MediaStreamTrackGeneratorCtor: new (options: {
    readonly kind: 'audio' | 'video';
  }) => GeneratedTrackLike<unknown>;
  readonly VideoFrameCtor: new (
    image: CanvasImageSource,
    init: {
      readonly duration?: number;
      readonly timestamp: number;
    },
  ) => { close(): void };
}

const defaultExportFps = 30;
const defaultExportVideoBitsPerSecond = 8_000_000;
const defaultExportWidth = 1280;
const defaultExportHeight = 720;
const exportStartDelaySeconds = 0.05;
const exportStartDelayMilliseconds = exportStartDelaySeconds * 1000;
const offlineExportAudioSampleRate = 48_000;
const offlineExportAudioChannels = 2;
const offlineAudioChunkFrames = 2_048;
const offlineExportAudioSegmentDurationMs = 10_000;

function createMediaName(timestamp: number): string {
  return `timeline-export-${timestamp}.webm`;
}

function createThumbnail(canvas: HTMLCanvasElement): string | undefined {
  try {
    return canvas.toDataURL('image/webp', 0.72);
  } catch {
    return undefined;
  }
}

function getSupportedMimeType(): string | undefined {
  const candidateMimeTypes = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];

  return candidateMimeTypes.find((candidateMimeType: string): boolean =>
    typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(candidateMimeType),
  );
}

export function resolveExportFrameCount(durationMs: number, fps: number): number {
  const safeFps = Math.max(1, fps);
  const frameDurationMs = 1000 / safeFps;
  return Math.max(1, Math.ceil(Math.max(0, durationMs) / frameDurationMs) + 1);
}

export function resolveExportFrameElapsedMs(
  frameIndex: number,
  durationMs: number,
  fps: number,
): number {
  const safeFrameIndex = Math.max(0, frameIndex);
  const safeFps = Math.max(1, fps);
  return Math.min(Math.max(0, durationMs), (safeFrameIndex * 1000) / safeFps);
}

function getGeneratedTrackSupport(): GeneratedTrackSupport | null {
  const globalScope = globalThis as typeof globalThis & {
    AudioData?: GeneratedTrackSupport['AudioDataCtor'];
    MediaStreamTrackGenerator?: GeneratedTrackSupport['MediaStreamTrackGeneratorCtor'];
    VideoFrame?: GeneratedTrackSupport['VideoFrameCtor'];
  };

  if (
    typeof MediaRecorder === 'undefined' ||
    typeof globalScope.MediaStreamTrackGenerator !== 'function' ||
    typeof globalScope.VideoFrame !== 'function' ||
    typeof globalScope.AudioData !== 'function'
  ) {
    return null;
  }

  return {
    AudioDataCtor: globalScope.AudioData,
    MediaStreamTrackGeneratorCtor: globalScope.MediaStreamTrackGenerator,
    VideoFrameCtor: globalScope.VideoFrame,
  };
}

function waitForVideoSeek(videoElement: HTMLVideoElement): Promise<void> {
  if (!videoElement.seeking) {
    return Promise.resolve();
  }

  return new Promise((resolve: () => void): void => {
    function handleSeeked(): void {
      videoElement.removeEventListener('seeked', handleSeeked);
      resolve();
    }

    videoElement.addEventListener('seeked', handleSeeked);
  });
}

async function loadPreparedSource(mediaItem: MediaItem): Promise<PreparedTimelineSource> {
  const objectUrl = URL.createObjectURL(mediaItem.blob);

  if (mediaItem.type === 'image') {
    const imageElement = new Image();
    imageElement.decoding = 'async';
    imageElement.src = objectUrl;
    await imageElement.decode();

    return {
      item: mediaItem,
      objectUrl,
      sourceElement: imageElement,
    };
  }

  const videoElement = document.createElement('video');
  videoElement.muted = true;
  videoElement.playsInline = true;
  videoElement.preload = 'auto';
  videoElement.src = objectUrl;

  await new Promise<void>((resolve: () => void, reject: (error: Error) => void): void => {
    function cleanup(): void {
      videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
      videoElement.removeEventListener('error', handleError);
    }

    function handleLoadedMetadata(): void {
      cleanup();
      resolve();
    }

    function handleError(): void {
      cleanup();
      reject(new Error(`Failed to load export source ${mediaItem.name}.`));
    }

    videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);
    videoElement.addEventListener('error', handleError);
  });

  return {
    item: mediaItem,
    objectUrl,
    sourceElement: videoElement,
  };
}

async function prepareTimelineSources(
  project: TimelineProject,
): Promise<Map<string, PreparedTimelineSource>> {
  const uniqueMediaIds = new Set<string>();

  Object.values(project.clipLookup).forEach((clip): void => {
    uniqueMediaIds.add(clip.source.mediaId);
  });

  const preparedEntries = await Promise.all(
    [...uniqueMediaIds].map(async (mediaId: string): Promise<readonly [string, PreparedTimelineSource]> => {
      const mediaItem = await getMediaById(mediaId);

      if (mediaItem === null) {
        throw new Error(`Timeline export is missing source media ${mediaId}.`);
      }

      const preparedSource = await loadPreparedSource(mediaItem);
      return [mediaId, preparedSource] as const;
    }),
  );

  return new Map<string, PreparedTimelineSource>(preparedEntries);
}

function resolveCanvasSize(
  preparedSources: ReadonlyMap<string, PreparedTimelineSource>,
): { readonly height: number; readonly width: number } {
  for (const preparedSource of preparedSources.values()) {
    if (preparedSource.sourceElement instanceof HTMLVideoElement) {
      if (preparedSource.sourceElement.videoWidth > 0 && preparedSource.sourceElement.videoHeight > 0) {
        return {
          height: preparedSource.sourceElement.videoHeight,
          width: preparedSource.sourceElement.videoWidth,
        };
      }
    } else if (
      preparedSource.sourceElement.naturalWidth > 0 &&
      preparedSource.sourceElement.naturalHeight > 0
    ) {
      return {
        height: preparedSource.sourceElement.naturalHeight,
        width: preparedSource.sourceElement.naturalWidth,
      };
    }
  }

  return {
    height: defaultExportHeight,
    width: defaultExportWidth,
  };
}

function revokePreparedSources(preparedSources: ReadonlyMap<string, PreparedTimelineSource>): void {
  preparedSources.forEach((preparedSource: PreparedTimelineSource): void => {
    URL.revokeObjectURL(preparedSource.objectUrl);

    if (preparedSource.sourceElement instanceof HTMLVideoElement) {
      preparedSource.sourceElement.pause();
      preparedSource.sourceElement.src = '';
      preparedSource.sourceElement.load();
    }
  });
}

async function prepareExportAudio(
  project: TimelineProject,
): Promise<PreparedExportAudio | null> {
  const audioInstructions = composeTimelinePlaybackAudioInstructions(project, 0, null);

  if (audioInstructions.length === 0) {
    return null;
  }

  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') {
    throw new Error('Timeline audio export requires Web Audio API support.');
  }

  const audioContext = new window.AudioContext();

  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  const destinationNode = audioContext.createMediaStreamDestination();
  const audioEngine = new TimelineAudioEngine({
    audioContext,
    outputNodes: [destinationNode],
  });

  await audioEngine.prefetchInstructions(audioInstructions);

  const anchorSeconds = audioContext.currentTime + exportStartDelaySeconds;
  const scheduledInstructions = composeTimelinePlaybackAudioInstructions(project, 0, anchorSeconds);

  await audioEngine.scheduleInstructions(scheduledInstructions);

  if (destinationNode.stream.getAudioTracks().length === 0) {
    audioEngine.stop();
    audioEngine.clearCache();
    await audioContext.close();
    throw new Error('Timeline audio export could not create an audio capture track.');
  }

  return {
    audioContext,
    audioEngine,
    anchorSeconds,
    destinationNode,
  };
}

async function prepareOfflineExportAudio(
  project: TimelineProject,
): Promise<PreparedOfflineExportAudio | null> {
  const audioInstructions = composeTimelinePlaybackAudioInstructions(project, 0, 0);

  if (audioInstructions.length === 0) {
    return null;
  }

  if (typeof window === 'undefined' || typeof window.OfflineAudioContext === 'undefined') {
    return null;
  }

  return {
    durationMs: project.durationMs,
    sampleRate: offlineExportAudioSampleRate,
  };
}

function resolveOfflineAudioFrameLength(durationMs: number, sampleRate: number): number {
  return Math.max(1, Math.round((durationMs * sampleRate) / 1000));
}

export function resolveOfflineAudioChunkRanges(
  durationMs: number,
  chunkDurationMs = offlineExportAudioSegmentDurationMs,
): readonly { readonly durationMs: number; readonly startMs: number }[] {
  const safeDurationMs = Math.max(0, durationMs);
  const safeChunkDurationMs = Math.max(1, chunkDurationMs);
  const ranges: Array<{ durationMs: number; startMs: number }> = [];

  for (let startMs = 0; startMs < safeDurationMs; startMs += safeChunkDurationMs) {
    ranges.push({
      durationMs: Math.min(safeChunkDurationMs, safeDurationMs - startMs),
      startMs,
    });
  }

  return ranges;
}

function resolveOfflineSegmentAudioInstructions(
  project: TimelineProject,
  startMs: number,
  durationMs: number,
): readonly TimelineAudioCompositionInstruction[] {
  return composeTimelinePlaybackAudioInstructions(project, startMs, 0)
    .map((instruction): TimelineAudioCompositionInstruction | null => {
      const startTimeSeconds = instruction.startTimeSeconds;

      if (startTimeSeconds === null) {
        return null;
      }

      const startTimeMs = Math.max(0, startTimeSeconds * 1000);
      if (startTimeMs >= durationMs) {
        return null;
      }

      const visibleDurationMs = Math.min(
        instruction.durationMs,
        Math.max(0, durationMs - startTimeMs),
      );

      if (visibleDurationMs <= 0) {
        return null;
      }

      return {
        ...instruction,
        durationMs: visibleDurationMs,
        endTimeSeconds: startTimeSeconds + visibleDurationMs / 1000,
      };
    })
    .filter(
      (
        instruction,
      ): instruction is TimelineAudioCompositionInstruction => instruction !== null,
    );
}

async function renderOfflineAudioSegment(
  project: TimelineProject,
  startMs: number,
  durationMs: number,
  decodedBufferCache: Map<string, Promise<AudioBuffer | null>>,
): Promise<AudioBuffer | null> {
  const segmentInstructions = resolveOfflineSegmentAudioInstructions(project, startMs, durationMs);

  if (segmentInstructions.length === 0) {
    return null;
  }

  if (typeof window === 'undefined' || typeof window.OfflineAudioContext === 'undefined') {
    return null;
  }

  const frameLength = resolveOfflineAudioFrameLength(
    durationMs,
    offlineExportAudioSampleRate,
  );
  const offlineAudioContext = new window.OfflineAudioContext(
    offlineExportAudioChannels,
    frameLength,
    offlineExportAudioSampleRate,
  );
  const audioEngine = new TimelineAudioEngine({
    audioContext: offlineAudioContext as unknown as AudioContext,
    decodedBufferCache,
  });

  try {
    await audioEngine.prefetchInstructions(segmentInstructions);
    await audioEngine.scheduleInstructions(segmentInstructions);
    return await offlineAudioContext.startRendering();
  } finally {
    audioEngine.clearCache();
  }
}

async function writePlanarAudioFrames(
  writer: WritableStreamDefaultWriter<unknown>,
  support: GeneratedTrackSupport,
  sampleRate: number,
  channelCount: number,
  frameCount: number,
  planarData: Float32Array,
  timestampFrames: number,
): Promise<void> {
  const audioData = new support.AudioDataCtor({
    data: planarData as unknown as BufferSource,
    format: 'f32-planar',
    numberOfChannels: channelCount,
    numberOfFrames: frameCount,
    sampleRate,
    timestamp: Math.round((timestampFrames / sampleRate) * 1_000_000),
  });

  try {
    await writer.write(audioData);
  } finally {
    audioData.close();
  }
}

async function renderTimelineExportFrame(
  project: TimelineProject,
  elapsedMs: number,
  preparedSources: ReadonlyMap<string, PreparedTimelineSource>,
  compositionAdapter: CompositionRenderAdapter,
  renderer: ReturnType<typeof createStudioRenderer>,
): Promise<TimelineExportProgress> {
  const compositionFrame = composeTimelineFrame(project, elapsedMs, {
    exportMode: true,
    isPlaying: false,
    qualityScale: 1,
  });
  const topLayer = getTopTimelineCompositionLayer(compositionFrame);
  const sourceOffsets = new Map<string, number>();

  compositionFrame.layers.forEach((layer): void => {
    sourceOffsets.set(layer.sourceId, layer.sourceOffsetMs);
  });
  compositionFrame.transitions.forEach((transition): void => {
    if (transition.sourceA !== null && transition.sourceAOffsetMs !== null) {
      sourceOffsets.set(transition.sourceA, transition.sourceAOffsetMs);
    }

    sourceOffsets.set(transition.sourceB, transition.sourceBOffsetMs);
  });

  await Promise.all(
    [...sourceOffsets.entries()].map(
      async ([sourceId, sourceOffsetMs]: readonly [string, number]): Promise<void> => {
        const preparedSource = preparedSources.get(sourceId);

        if (
          preparedSource === undefined ||
          !(preparedSource.sourceElement instanceof HTMLVideoElement)
        ) {
          return;
        }

        const nextTimeSeconds = sourceOffsetMs / 1000;

        if (Math.abs(preparedSource.sourceElement.currentTime - nextTimeSeconds) > 0.04) {
          preparedSource.sourceElement.currentTime = nextTimeSeconds;
          await waitForVideoSeek(preparedSource.sourceElement);
        }
      },
    ),
  );

  compositionAdapter.setInstruction(compositionFrame);
  const adaptedRenderState = compositionAdapter.deriveRenderState({
    bypassHeavyPreviewPasses: false,
    exportMode: true,
    isPlaybackActive: false,
    qualityScale: 1,
  });
  const renderSourceElement =
    adaptedRenderState.composition === null
      ? topLayer === null
        ? null
        : preparedSources.get(topLayer.sourceId)?.sourceElement ?? null
      : null;

  renderer.renderFrame(
    renderSourceElement,
    {
      aiState: {
        backgroundBlurEnabled: false,
        backgroundBlurStrength: 0.65,
        beauty: defaultBeautyRuntimeState,
        faceRegions: [],
        segmentationMask: null,
      },
      activeLut: null,
      colorGrading: defaultColorGradingSettings,
      compositionLayerBindings: adaptedRenderState.compositionLayerBindings,
      comparison: defaultRenderComparisonConfig,
      composition: adaptedRenderState.composition,
      maskRefinement: defaultRenderMaskRefinementConfig,
      mode: RenderMode.Passthrough,
      passDirectives: adaptedRenderState.passDirectives,
      performance: adaptedRenderState.performance,
      pictureInPicture: defaultPictureInPictureConfig,
      timeSeconds: elapsedMs / 1000,
      transform: defaultTransformSettings,
    },
    compositionAdapter,
  );

  if (renderSourceElement === null && adaptedRenderState.composition === null) {
    throw new Error('Timeline export has no renderable source for the current frame.');
  }

  return {
    elapsedMs,
    fraction: Math.min(1, elapsedMs / project.durationMs),
    playheadMs: compositionFrame.metadata.playheadMs,
  };
}

async function writeOfflineAudioTrack(
  writer: WritableStreamDefaultWriter<unknown>,
  support: GeneratedTrackSupport,
  project: TimelineProject,
  offlineAudio: PreparedOfflineExportAudio,
  signal?: AbortSignal,
): Promise<void> {
  const { sampleRate } = offlineAudio;
  const decodedBufferCache = new Map<string, Promise<AudioBuffer | null>>();
  let writtenFrames = 0;

  for (const range of resolveOfflineAudioChunkRanges(offlineAudio.durationMs)) {
    if (signal?.aborted) {
      throw new Error('Timeline export was cancelled.');
    }

    const audioBuffer = await renderOfflineAudioSegment(
      project,
      range.startMs,
      range.durationMs,
      decodedBufferCache,
    );
    const chunkFrameLength = resolveOfflineAudioFrameLength(range.durationMs, sampleRate);

    if (audioBuffer === null) {
      let remainingFrames = chunkFrameLength;

      while (remainingFrames > 0) {
        const frameCount = Math.min(offlineAudioChunkFrames, remainingFrames);
        await writePlanarAudioFrames(
          writer,
          support,
          sampleRate,
          offlineExportAudioChannels,
          frameCount,
          new Float32Array(frameCount * offlineExportAudioChannels),
          writtenFrames,
        );
        writtenFrames += frameCount;
        remainingFrames -= frameCount;
      }

      continue;
    }

    const channelCount = audioBuffer.numberOfChannels;
    const totalFrames = audioBuffer.length;

    for (let offset = 0; offset < totalFrames; offset += offlineAudioChunkFrames) {
      const frameCount = Math.min(offlineAudioChunkFrames, totalFrames - offset);
      const planarData = new Float32Array(frameCount * channelCount);

      for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
        planarData.set(
          audioBuffer.getChannelData(channelIndex).subarray(offset, offset + frameCount),
          channelIndex * frameCount,
        );
      }

      await writePlanarAudioFrames(
        writer,
        support,
        sampleRate,
        channelCount,
        frameCount,
        planarData,
        writtenFrames + offset,
      );
    }

    writtenFrames += totalFrames;
  }
}

async function exportTimelineWithGeneratedTracks(
  options: TimelineExportOptions,
  support: GeneratedTrackSupport,
  preparedSources: ReadonlyMap<string, PreparedTimelineSource>,
  exportCanvas: HTMLCanvasElement,
  renderer: ReturnType<typeof createStudioRenderer>,
  compositionAdapter: CompositionRenderAdapter,
): Promise<MediaItem> {
  const fps = Math.max(1, options.fps ?? defaultExportFps);
  const frameCount = resolveExportFrameCount(options.project.durationMs, fps);
  const frameDurationUs = Math.round(1_000_000 / fps);
  const exportStartedAt = Date.now();
  const mimeType = getSupportedMimeType();
  const recorderOptions: MediaRecorderOptions =
    mimeType === undefined
      ? { videoBitsPerSecond: options.videoBitsPerSecond ?? defaultExportVideoBitsPerSecond }
      : {
          mimeType,
          videoBitsPerSecond: options.videoBitsPerSecond ?? defaultExportVideoBitsPerSecond,
        };
  const videoTrack = new support.MediaStreamTrackGeneratorCtor({ kind: 'video' });
  const outputStream = new MediaStream([videoTrack as unknown as MediaStreamTrack]);
  const offlineAudio = await prepareOfflineExportAudio(options.project);

  let audioTrack: GeneratedTrackLike<unknown> | null = null;
  if (offlineAudio !== null) {
    audioTrack = new support.MediaStreamTrackGeneratorCtor({ kind: 'audio' });
    outputStream.addTrack(audioTrack as unknown as MediaStreamTrack);
  }

  const recorder = new MediaRecorder(outputStream, recorderOptions);
  const exportChunks: Blob[] = [];

  recorder.ondataavailable = (event: BlobEvent): void => {
    if (event.data.size > 0) {
      exportChunks.push(event.data);
    }
  };

  const mediaItemPromise = new Promise<MediaItem>((resolve, reject): void => {
    recorder.onerror = (): void => {
      reject(new Error('Timeline export failed while encoding the generated output stream.'));
    };

    recorder.onstop = (): void => {
      const finalBlob = new Blob(exportChunks, {
        type: recorder.mimeType || mimeType || 'video/webm',
      });
      const finishedAt = Date.now();
      const thumbnail = createThumbnail(exportCanvas);

      resolve({
        blob: finalBlob,
        captureMode: 'recording',
        createdAt: exportStartedAt,
        durationMs: options.project.durationMs,
        height: exportCanvas.height,
        id: crypto.randomUUID(),
        isAvailable: true,
        mimeType: finalBlob.type || 'video/webm',
        name: createMediaName(exportStartedAt),
        origin: 'capture',
        sizeBytes: finalBlob.size,
        storageKind: 'copied-indexeddb',
        ...(thumbnail === undefined ? {} : { thumbnail }),
        timestamp: finishedAt,
        type: 'video',
        width: exportCanvas.width,
      });
    };
  });

  recorder.start();
  renderer.initialize();
  preparedSources.forEach((preparedSource: PreparedTimelineSource, sourceId: string): void => {
    compositionAdapter.bindSource(sourceId, preparedSource.sourceElement);
  });

  const videoWriter = videoTrack.writable.getWriter();
  const audioWriter = audioTrack?.writable.getWriter() ?? null;

  try {
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      if (options.signal?.aborted) {
        throw new Error('Timeline export was cancelled.');
      }

      const elapsedMs = resolveExportFrameElapsedMs(
        frameIndex,
        options.project.durationMs,
        fps,
      );
      const progress = await renderTimelineExportFrame(
        options.project,
        elapsedMs,
        preparedSources,
        compositionAdapter,
        renderer,
      );
      options.onProgress?.(progress);

      const videoFrame = new support.VideoFrameCtor(exportCanvas, {
        duration: frameDurationUs,
        timestamp: Math.round(elapsedMs * 1000),
      });

      try {
        await videoWriter.write(videoFrame);
      } finally {
        videoFrame.close();
      }
    }

    await videoWriter.close();

    if (audioWriter !== null && offlineAudio !== null) {
      await writeOfflineAudioTrack(
        audioWriter,
        support,
        options.project,
        offlineAudio,
        options.signal,
      );
      await audioWriter.close();
    }

    (videoTrack as unknown as MediaStreamTrack).stop();
    (audioTrack as unknown as MediaStreamTrack | null)?.stop();
    recorder.stop();
    return await mediaItemPromise;
  } catch (error: unknown) {
    try {
      recorder.stop();
    } catch {
      // Ignore recorder stop races after export failures.
    }
    throw error instanceof Error ? error : new Error('Timeline export failed unexpectedly.');
  } finally {
    exportChunks.length = 0;
  }
}

export async function exportTimelineToMediaItem(
  options: TimelineExportOptions,
): Promise<MediaItem> {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('Timeline export requires MediaRecorder support.');
  }

  if (options.project.durationMs <= 0) {
    throw new Error('Cannot export an empty timeline.');
  }

  const preparedSources = await prepareTimelineSources(options.project);
  const canvasSize = resolveCanvasSize(preparedSources);
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = canvasSize.width;
  exportCanvas.height = canvasSize.height;
  const renderer = createStudioRenderer(exportCanvas);
  const compositionAdapter = new CompositionRenderAdapter();
  try {
    const generatedTrackSupport = getGeneratedTrackSupport();

    if (generatedTrackSupport !== null) {
      return await exportTimelineWithGeneratedTracks(
        options,
        generatedTrackSupport,
        preparedSources,
        exportCanvas,
        renderer,
        compositionAdapter,
      );
    }

    const preparedAudio = await prepareExportAudio(options.project);

    if (typeof exportCanvas.captureStream !== 'function') {
      preparedAudio?.audioEngine.stop();
      void preparedAudio?.audioContext.close().catch((): void => undefined);
      throw new Error('Canvas stream capture is unavailable in this browser.');
    }

    const exportStream = exportCanvas.captureStream(options.fps ?? defaultExportFps);
    preparedAudio?.destinationNode.stream
      .getAudioTracks()
      .forEach((track: MediaStreamTrack): void => {
        exportStream.addTrack(track);
      });
    const mimeType = getSupportedMimeType();
    const recorderOptions: MediaRecorderOptions =
      mimeType === undefined
        ? { videoBitsPerSecond: options.videoBitsPerSecond ?? defaultExportVideoBitsPerSecond }
        : {
            mimeType,
            videoBitsPerSecond: options.videoBitsPerSecond ?? defaultExportVideoBitsPerSecond,
          };
    const recorder = new MediaRecorder(exportStream, recorderOptions);
    const exportChunks: Blob[] = [];
    const exportStartedAt = Date.now();
    const abortSignal = options.signal;

    let animationFrameId: number | null = null;
    let settled = false;

    function cleanup(): void {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }

      exportStream.getTracks().forEach((track: MediaStreamTrack): void => {
        track.stop();
      });
      preparedAudio?.audioEngine.stop();
      preparedAudio?.audioEngine.clearCache();
      preparedAudio?.destinationNode.stream.getTracks().forEach((track: MediaStreamTrack): void => {
        track.stop();
      });
      void preparedAudio?.audioContext.close().catch((): void => undefined);
      exportChunks.length = 0;
    }

    function finalizeWithError(error: Error): never {
      if (!settled) {
        settled = true;
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.onerror = null;
        cleanup();
      }

      throw error;
    }

    recorder.ondataavailable = (event: BlobEvent): void => {
      if (event.data.size > 0) {
        exportChunks.push(event.data);
      }
    };

    const mediaItemPromise = new Promise<MediaItem>((resolve, reject): void => {
      recorder.onerror = (): void => {
        reject(new Error('Timeline export failed while encoding the output stream.'));
      };

      recorder.onstop = (): void => {
        const finalBlob = new Blob(exportChunks, {
          type: recorder.mimeType || mimeType || 'video/webm',
        });
        const finishedAt = Date.now();
        const thumbnail = createThumbnail(exportCanvas);
        const nextMediaItem: MediaItem = {
          blob: finalBlob,
          captureMode: 'recording',
          createdAt: exportStartedAt,
          durationMs: options.project.durationMs,
          height: exportCanvas.height,
          id: crypto.randomUUID(),
          isAvailable: true,
          mimeType: finalBlob.type || 'video/webm',
          name: createMediaName(exportStartedAt),
          origin: 'capture',
          sizeBytes: finalBlob.size,
          storageKind: 'copied-indexeddb',
          ...(thumbnail === undefined ? {} : { thumbnail }),
          timestamp: finishedAt,
          type: 'video',
          width: exportCanvas.width,
        };

        resolve(nextMediaItem);
      };
    });

    recorder.start(250);

    renderer.initialize();
    preparedSources.forEach((preparedSource: PreparedTimelineSource, sourceId: string): void => {
      compositionAdapter.bindSource(sourceId, preparedSource.sourceElement);
    });

    await new Promise<void>((resolve: () => void, reject: (error: Error) => void): void => {
      const startTime =
        preparedAudio === null
          ? performance.now() + exportStartDelayMilliseconds
          : performance.now() +
            Math.max(
              0,
              (preparedAudio.anchorSeconds - preparedAudio.audioContext.currentTime) * 1000,
            );

      const step = async (now: number): Promise<void> => {
        if (abortSignal?.aborted) {
          try {
            recorder.stop();
          } catch {
            // Ignore stop races during cancellation.
          }

          reject(new Error('Timeline export was cancelled.'));
          return;
        }

        const elapsedMs = Math.min(
          options.project.durationMs,
          Math.max(0, now - startTime),
        );

        try {
          const progress = await renderTimelineExportFrame(
            options.project,
            elapsedMs,
            preparedSources,
            compositionAdapter,
            renderer,
          );
          options.onProgress?.(progress);
        } catch (error: unknown) {
          reject(error instanceof Error ? error : new Error('Timeline export render failed.'));
          return;
        }

        if (elapsedMs >= options.project.durationMs) {
          try {
            recorder.stop();
          } catch {
            reject(new Error('Timeline export failed to finalize the recording.'));
            return;
          }

          resolve();
          return;
        }

        animationFrameId = window.requestAnimationFrame((timestamp: number): void => {
          void step(timestamp).catch((error: unknown): void => {
            reject(error instanceof Error ? error : new Error('Timeline export render failed.'));
          });
        });
      };

      animationFrameId = window.requestAnimationFrame((timestamp: number): void => {
        void step(timestamp).catch((error: unknown): void => {
          reject(error instanceof Error ? error : new Error('Timeline export render failed.'));
        });
      });
    }).catch((error: Error): never => finalizeWithError(error));

    const mediaItem = await mediaItemPromise;
    settled = true;
    cleanup();
    return mediaItem;
  } finally {
    renderer.dispose();
    revokePreparedSources(preparedSources);
  }
}
