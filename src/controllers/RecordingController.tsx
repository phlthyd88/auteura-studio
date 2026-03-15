import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { useAudioContext } from '../context/AudioContext';
import { useRenderController } from './RenderController';
import TimelapseTimerWorkerConstructor from '../workers/TimelapseTimerWorker?worker';
import {
  getImportedMediaCapability,
  pickImportedMediaHandles,
  prepareImportedMediaFiles,
} from '../services/ImportedMediaHandleService';
import {
  deleteCapturePreset,
  listCapturePresets,
  saveCapturePreset,
} from '../services/CapturePresetStorageService';
import {
  appendChunkedRecordingMediaChunk,
  clearAll as clearStoredMedia,
  createChunkedRecordingMedia,
  deleteMedia as deleteStoredMedia,
  discardChunkedRecordingMedia,
  ensureImportCopyCapacity,
  finalizeChunkedRecordingMedia,
  getAllMedia,
  getMediaStorageStats,
  resetMediaDatabase as resetStoredMediaDatabase,
  saveImportedMedia,
  saveMedia,
  type MediaItem,
  type MediaStorageStats,
} from '../services/MediaStorageService';
import {
  bundledCapturePresets,
  type CapturePresetRecord,
  type StillImageFormat,
} from '../types/capturePreset';
import type { ImportedMediaCapability } from '../types/importedMedia';

export interface RecordingProfile {
  readonly description: string;
  readonly id: string;
  readonly label: string;
  readonly videoBitsPerSecond: number;
}

export interface RecordingControllerContextValue {
  readonly availableCapturePresets: readonly CapturePresetRecord[];
  readonly availableProfiles: readonly RecordingProfile[];
  readonly burstCount: number;
  readonly countdownRemaining: number;
  readonly countdownSeconds: number;
  readonly error: string | null;
  readonly importedMediaCapability: ImportedMediaCapability;
  readonly isBurstCapturing: boolean;
  readonly isCountingDown: boolean;
  readonly isImportingMedia: boolean;
  readonly isProcessingCapture: boolean;
  readonly isRecording: boolean;
  readonly isTimelapseCapturing: boolean;
  readonly mediaItems: readonly MediaItem[];
  readonly recordingTime: number;
  readonly selectedCapturePresetId: string | null;
  readonly selectedProfileId: string;
  readonly stillImageFormat: StillImageFormat;
  readonly storageStats: MediaStorageStats | null;
  readonly timelapseIntervalSeconds: number;
  readonly timelapseMaxShots: number | null;
  readonly timelapseShotsCaptured: number;
  readonly timelapseState: 'idle' | 'paused-hidden' | 'running';
  applyCapturePreset: (presetId: string) => void;
  captureBurst: () => Promise<void>;
  capturePhoto: () => Promise<void>;
  clearMediaLibrary: () => Promise<void>;
  deleteMediaItem: (id: string) => Promise<void>;
  deleteUserCapturePreset: (presetId: string) => Promise<void>;
  importMediaFromDisk: (files?: readonly File[]) => Promise<void>;
  refreshMediaItems: () => Promise<void>;
  resetMediaDatabase: () => Promise<void>;
  saveCurrentCapturePreset: (name: string) => Promise<void>;
  setBurstCount: (nextCount: number) => void;
  setCountdownSeconds: (nextSeconds: number) => void;
  setStillImageFormat: (nextFormat: StillImageFormat) => void;
  setRecordingProfileId: (profileId: string) => void;
  setTimelapseIntervalSeconds: (nextSeconds: number) => void;
  setTimelapseMaxShots: (nextCount: number | null) => void;
  startRecording: () => Promise<void>;
  startTimelapseCapture: () => Promise<void>;
  stopRecording: () => void;
  stopTimelapseCapture: () => void;
}

const RecordingControllerContext = createContext<RecordingControllerContextValue | null>(null);
const recordingLiveInputOwnerId = 'recording-controller';

const recordingProfiles: readonly RecordingProfile[] = [
  {
    description: 'Smaller files for quick captures.',
    id: 'compact',
    label: 'Compact',
    videoBitsPerSecond: 4_000_000,
  },
  {
    description: 'Balanced quality and storage usage.',
    id: 'balanced',
    label: 'Balanced',
    videoBitsPerSecond: 8_000_000,
  },
  {
    description: 'Highest available bitrate for archive captures.',
    id: 'quality',
    label: 'Quality',
    videoBitsPerSecond: 16_000_000,
  },
];

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve: () => void): number => window.setTimeout(resolve, milliseconds));
}

function getSupportedMimeType(): string | undefined {
  const candidateMimeTypes = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=h264,opus',
    'video/webm',
  ];

  return candidateMimeTypes.find((candidateMimeType: string): boolean =>
    typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(candidateMimeType),
  );
}

function createThumbnail(canvas: HTMLCanvasElement): string | undefined {
  try {
    return canvas.toDataURL('image/webp', 0.72);
  } catch {
    return undefined;
  }
}

function createCapturePresetName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, 48);
}

type TimelapseSessionState = 'idle' | 'paused-hidden' | 'running';

interface TimelapseWorkerResponse {
  readonly type: 'TICK';
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve: (blob: Blob) => void, reject: (error: Error) => void): void => {
    canvas.toBlob(
      (blob: Blob | null): void => {
        if (blob === null) {
          reject(new Error('Canvas capture failed.'));
          return;
        }

        resolve(blob);
      },
      mimeType,
      quality,
    );
  });
}

function createMediaName(
  captureMode: MediaItem['captureMode'],
  mimeType: string,
  timestamp: number,
): string {
  const extension =
    mimeType === 'image/webp'
      ? 'webp'
      : mimeType === 'image/png'
        ? 'png'
        : mimeType.includes('webm')
          ? 'webm'
          : 'bin';

  return `${captureMode}-${timestamp}.${extension}`;
}

export function RecordingController({ children }: PropsWithChildren): JSX.Element {
  const {
    destinationStream,
    ensureAudioContext,
    releaseLiveInputStream,
    requestLiveInputStream,
  } = useAudioContext();
  const { canvasRef } = useRenderController();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const countdownRequestIdRef = useRef<number>(0);
  const countdownTimerRef = useRef<number | null>(null);
  const mediaImportAbortControllerRef = useRef<AbortController | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const timelapseWorkerRef = useRef<Worker | null>(null);
  const timelapseCaptureInFlightRef = useRef<boolean>(false);
  const timelapseStateRef = useRef<TimelapseSessionState>('idle');
  const timelapseIntervalSecondsRef = useRef<number>(5);
  const timelapseMaxShotsRef = useRef<number | null>(null);
  const timelapseShotsCapturedRef = useRef<number>(0);
  const isRecordingRef = useRef<boolean>(false);
  const isProcessingCaptureRef = useRef<boolean>(false);
  const isBurstCapturingRef = useRef<boolean>(false);
  const isTimelapseCapturingRef = useRef<boolean>(false);
  const timelapseTickHandlerRef = useRef<(() => void) | null>(null);
  const [countdownRemaining, setCountdownRemaining] = useState<number>(0);
  const [countdownSeconds, setCountdownSecondsState] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [availableCapturePresets, setAvailableCapturePresets] = useState<
    readonly CapturePresetRecord[]
  >(bundledCapturePresets);
  const [burstCount, setBurstCountState] = useState<number>(3);
  const [isBurstCapturing, setIsBurstCapturing] = useState<boolean>(false);
  const [isCountingDown, setIsCountingDown] = useState<boolean>(false);
  const [isImportingMedia, setIsImportingMedia] = useState<boolean>(false);
  const [isProcessingCapture, setIsProcessingCapture] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isTimelapseCapturing, setIsTimelapseCapturing] = useState<boolean>(false);
  const [mediaItems, setMediaItems] = useState<readonly MediaItem[]>([]);
  const [recordingTime, setRecordingTime] = useState<number>(0);
  const [selectedCapturePresetId, setSelectedCapturePresetId] = useState<string | null>(
    bundledCapturePresets[0]?.id ?? null,
  );
  const [selectedProfileId, setSelectedProfileId] = useState<string>('balanced');
  const [stillImageFormat, setStillImageFormatState] = useState<StillImageFormat>('image/webp');
  const [storageStats, setStorageStats] = useState<MediaStorageStats | null>(null);
  const [timelapseIntervalSeconds, setTimelapseIntervalSecondsState] = useState<number>(5);
  const [timelapseMaxShots, setTimelapseMaxShotsState] = useState<number | null>(null);
  const [timelapseShotsCaptured, setTimelapseShotsCaptured] = useState<number>(0);
  const [timelapseState, setTimelapseState] = useState<TimelapseSessionState>('idle');
  const importedMediaCapability = useMemo<ImportedMediaCapability>(
    (): ImportedMediaCapability => getImportedMediaCapability(),
    [],
  );

  const selectedProfile =
    recordingProfiles.find((profile: RecordingProfile): boolean => profile.id === selectedProfileId) ??
    recordingProfiles[1]!;

  const updateTimelapseState = useCallback((nextState: TimelapseSessionState): void => {
    timelapseStateRef.current = nextState;
    setTimelapseState(nextState);
  }, []);

  const updateTimelapseShotsCaptured = useCallback((nextCount: number): void => {
    timelapseShotsCapturedRef.current = nextCount;
    setTimelapseShotsCaptured(nextCount);
  }, []);

  useEffect((): void => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect((): void => {
    isProcessingCaptureRef.current = isProcessingCapture;
  }, [isProcessingCapture]);

  useEffect((): void => {
    isBurstCapturingRef.current = isBurstCapturing;
  }, [isBurstCapturing]);

  useEffect((): void => {
    isTimelapseCapturingRef.current = isTimelapseCapturing;
  }, [isTimelapseCapturing]);

  useEffect((): void => {
    timelapseIntervalSecondsRef.current = timelapseIntervalSeconds;
  }, [timelapseIntervalSeconds]);

  useEffect((): void => {
    timelapseMaxShotsRef.current = timelapseMaxShots;
  }, [timelapseMaxShots]);

  const refreshMediaItems = useCallback(async (): Promise<void> => {
    try {
      const [storedItems, nextStorageStats] = await Promise.all([
        getAllMedia(),
        getMediaStorageStats(),
      ]);
      setMediaItems(storedItems);
      setStorageStats(nextStorageStats);
    } catch (storageError: unknown) {
      setError(storageError instanceof Error ? storageError.message : 'Failed to load media items.');
    }
  }, []);

  const refreshCapturePresets = useCallback(async (): Promise<void> => {
    try {
      const storedPresets = await listCapturePresets();
      setAvailableCapturePresets([...bundledCapturePresets, ...storedPresets]);
    } catch (storageError: unknown) {
      setError(
        storageError instanceof Error
          ? storageError.message
          : 'Failed to load capture presets.',
      );
    }
  }, []);

  const deleteMediaItem = useCallback(async (id: string): Promise<void> => {
    try {
      await deleteStoredMedia(id);
      await refreshMediaItems();
    } catch (storageError: unknown) {
      setError(storageError instanceof Error ? storageError.message : 'Failed to delete media item.');
    }
  }, [refreshMediaItems]);

  const clearMediaLibrary = useCallback(async (): Promise<void> => {
    try {
      await clearStoredMedia();
      await refreshMediaItems();
    } catch (storageError: unknown) {
      setError(storageError instanceof Error ? storageError.message : 'Failed to clear saved media.');
    }
  }, [refreshMediaItems]);

  const setCountdownSeconds = useCallback((nextSeconds: number): void => {
    setSelectedCapturePresetId(null);
    setCountdownSecondsState(Math.max(0, Math.floor(nextSeconds)));
  }, []);

  const setRecordingProfileId = useCallback((profileId: string): void => {
    setSelectedCapturePresetId(null);
    setSelectedProfileId(profileId);
  }, []);

  const setBurstCount = useCallback((nextCount: number): void => {
    setSelectedCapturePresetId(null);
    setBurstCountState(Math.max(1, Math.min(9, Math.floor(nextCount))));
  }, []);

  const setStillImageFormat = useCallback((nextFormat: StillImageFormat): void => {
    setSelectedCapturePresetId(null);
    setStillImageFormatState(nextFormat);
  }, []);

  const setTimelapseIntervalSeconds = useCallback((nextSeconds: number): void => {
    setSelectedCapturePresetId(null);
    const normalizedSeconds = Math.max(1, Math.min(3600, Math.floor(nextSeconds)));
    timelapseIntervalSecondsRef.current = normalizedSeconds;
    setTimelapseIntervalSecondsState(normalizedSeconds);
  }, []);

  const setTimelapseMaxShots = useCallback((nextCount: number | null): void => {
    setSelectedCapturePresetId(null);

    if (nextCount === null) {
      timelapseMaxShotsRef.current = null;
      setTimelapseMaxShotsState(null);
      return;
    }

    const normalizedCount = Math.max(1, Math.min(5000, Math.floor(nextCount)));
    timelapseMaxShotsRef.current = normalizedCount;
    setTimelapseMaxShotsState(normalizedCount);
  }, []);

  const applyCapturePreset = useCallback(
    (presetId: string): void => {
      const preset = availableCapturePresets.find(
        (candidate: CapturePresetRecord): boolean => candidate.id === presetId,
      );

      if (preset === undefined) {
        return;
      }

      setSelectedCapturePresetId(preset.id);
      setSelectedProfileId(preset.settings.recordingProfileId);
      setCountdownSecondsState(preset.settings.countdownSeconds);
      setBurstCountState(preset.settings.burstCount);
      setStillImageFormatState(preset.settings.stillImageFormat);
    },
    [availableCapturePresets],
  );

  const saveCurrentCapturePreset = useCallback(
    async (name: string): Promise<void> => {
      const normalizedName = createCapturePresetName(name);

      if (normalizedName.length === 0) {
        throw new Error('Preset name is required.');
      }

      const timestamp = Date.now();
      const preset: CapturePresetRecord = {
        createdAt: timestamp,
        description: `Saved ${selectedProfile.label.toLowerCase()} capture settings.`,
        id: `capture-${timestamp}-${crypto.randomUUID()}`,
        isBundled: false,
        label: normalizedName,
        settings: {
          burstCount,
          countdownSeconds,
          recordingProfileId: selectedProfileId,
          stillImageFormat,
        },
        updatedAt: timestamp,
      };

      await saveCapturePreset(preset);
      await refreshCapturePresets();
      setSelectedCapturePresetId(preset.id);
    },
    [
      burstCount,
      countdownSeconds,
      refreshCapturePresets,
      selectedProfile.label,
      selectedProfileId,
      stillImageFormat,
    ],
  );

  const deleteUserCapturePreset = useCallback(
    async (presetId: string): Promise<void> => {
      const preset = availableCapturePresets.find(
        (candidate: CapturePresetRecord): boolean => candidate.id === presetId,
      );

      if (preset === undefined || preset.isBundled) {
        return;
      }

      await deleteCapturePreset(presetId);
      await refreshCapturePresets();
      if (selectedCapturePresetId === presetId) {
        setSelectedCapturePresetId(null);
      }
    },
    [availableCapturePresets, refreshCapturePresets, selectedCapturePresetId],
  );

  const importMediaFromDisk = useCallback(
    async (files?: readonly File[]): Promise<void> => {
      if (isImportingMedia) {
        return;
      }

      const abortController = new AbortController();
      mediaImportAbortControllerRef.current?.abort();
      mediaImportAbortControllerRef.current = abortController;
      setIsImportingMedia(true);
      setError(null);

      try {
        const preparedMedia =
          files === undefined
            ? await pickImportedMediaHandles(abortController.signal)
            : await prepareImportedMediaFiles(files, abortController.signal);

        if (preparedMedia.length === 0) {
          return;
        }

        const copiedBytes = preparedMedia
          .filter((item): boolean => item.importStrategy === 'copied-indexeddb')
          .reduce((totalBytes: number, item): number => totalBytes + item.sizeBytes, 0);

        if (copiedBytes > 0) {
          await ensureImportCopyCapacity(copiedBytes);
        }

        for (const item of preparedMedia) {
          await saveImportedMedia(item);
        }

        await refreshMediaItems();
      } catch (importError: unknown) {
        setError(
          importError instanceof Error
            ? importError.message
            : 'Failed to import local media.',
        );
      } finally {
        if (mediaImportAbortControllerRef.current === abortController) {
          mediaImportAbortControllerRef.current = null;
        }
        setIsImportingMedia(false);
      }
    },
    [isImportingMedia, refreshMediaItems],
  );

  const cancelCountdown = useCallback((): void => {
    countdownRequestIdRef.current += 1;

    if (countdownTimerRef.current !== null) {
      window.clearTimeout(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    setIsCountingDown(false);
    setCountdownRemaining(0);
  }, []);

  const runCountdown = useCallback(async (): Promise<boolean> => {
    if (countdownSeconds <= 0) {
      cancelCountdown();
      return true;
    }

    const requestId = countdownRequestIdRef.current + 1;
    countdownRequestIdRef.current = requestId;
    setIsCountingDown(true);

    for (let remaining = countdownSeconds; remaining > 0; remaining -= 1) {
      if (countdownRequestIdRef.current !== requestId) {
        return false;
      }

      setCountdownRemaining(remaining);

      await new Promise<void>((resolve: () => void): void => {
        countdownTimerRef.current = window.setTimeout((): void => {
          countdownTimerRef.current = null;
          resolve();
        }, 1000);
      });
    }

    if (countdownRequestIdRef.current !== requestId) {
      return false;
    }

    setIsCountingDown(false);
    setCountdownRemaining(0);
    return true;
  }, [cancelCountdown, countdownSeconds]);

  const createSnapshotItem = useCallback(
    async (
      canvasElement: HTMLCanvasElement,
      captureMode: MediaItem['captureMode'],
    ): Promise<MediaItem> => {
      const mimeType = stillImageFormat;
      const timestamp = Date.now();
      const blob = await canvasToBlob(
        canvasElement,
        mimeType,
        mimeType === 'image/webp' ? 0.92 : undefined,
      );
      const thumbnail = createThumbnail(canvasElement);

      return {
        availability: 'available',
        blob,
        captureMode,
        createdAt: timestamp,
        height: canvasElement.height,
        id: crypto.randomUUID(),
        isAvailable: true,
        mimeType,
        name: createMediaName(captureMode, mimeType, timestamp),
        origin: 'capture',
        sizeBytes: blob.size,
        storageKind: 'copied-indexeddb',
        ...(thumbnail === undefined ? {} : { thumbnail }),
        timestamp,
        type: 'image',
        width: canvasElement.width,
      };
    },
    [stillImageFormat],
  );

  const persistMediaItems = useCallback(async (items: readonly MediaItem[]): Promise<void> => {
    for (const item of items) {
      await saveMedia(item);
    }

    await refreshMediaItems();
  }, [refreshMediaItems]);

  const postTimelapseWorkerMessage = useCallback(
    (message:
      | {
          readonly intervalMs: number;
          readonly type: 'START';
        }
      | {
          readonly type: 'PAUSE' | 'RESUME' | 'STOP';
        }): void => {
      timelapseWorkerRef.current?.postMessage(message);
    },
    [],
  );

  const stopTimelapseSession = useCallback(
    (nextState: TimelapseSessionState = 'idle'): void => {
      postTimelapseWorkerMessage({
        type: 'STOP',
      });
      timelapseCaptureInFlightRef.current = false;
      isTimelapseCapturingRef.current = false;
      setIsTimelapseCapturing(false);
      updateTimelapseState(nextState);
      setIsProcessingCapture(false);
    },
    [postTimelapseWorkerMessage, updateTimelapseState],
  );

  const captureTimelapseFrame = useCallback(async (): Promise<void> => {
    if (!isTimelapseCapturingRef.current || timelapseCaptureInFlightRef.current) {
      return;
    }

    if (document.hidden) {
      if (timelapseStateRef.current === 'running') {
        postTimelapseWorkerMessage({
          type: 'PAUSE',
        });
        updateTimelapseState('paused-hidden');
      }
      return;
    }

    // Robustness: If we are visible but still in paused-hidden state, resume.
    if (timelapseStateRef.current === 'paused-hidden' && !document.hidden) {
      updateTimelapseState('running');
      postTimelapseWorkerMessage({
        type: 'RESUME',
      });
    }

    if (
      timelapseStateRef.current !== 'running' ||
      isRecordingRef.current ||
      isBurstCapturingRef.current
    ) {
      return;
    }

    const canvasElement = canvasRef.current;

    if (canvasElement === null) {
      setError('Timelapse capture paused because the render canvas is unavailable.');
      stopTimelapseSession();
      return;
    }

    timelapseCaptureInFlightRef.current = true;
    setIsProcessingCapture(true);

    try {
      const timelapseItem = await createSnapshotItem(canvasElement, 'timelapse');
      await persistMediaItems([timelapseItem]);

      const nextShotCount = timelapseShotsCapturedRef.current + 1;
      updateTimelapseShotsCaptured(nextShotCount);

      const maxShots = timelapseMaxShotsRef.current;

      if (maxShots !== null && nextShotCount >= maxShots) {
        stopTimelapseSession();
      }
    } catch (captureError: unknown) {
      setError(
        captureError instanceof Error
          ? captureError.message
          : 'Timelapse capture failed unexpectedly.',
      );
      stopTimelapseSession();
    } finally {
      timelapseCaptureInFlightRef.current = false;
      setIsProcessingCapture(false);
    }
  }, [
    canvasRef,
    createSnapshotItem,
    persistMediaItems,
    postTimelapseWorkerMessage,
    stopTimelapseSession,
    updateTimelapseShotsCaptured,
    updateTimelapseState,
  ]);

  const buildRecordingStream = useCallback(async (): Promise<MediaStream> => {
    const canvasElement = canvasRef.current;

    if (canvasElement === null) {
      throw new Error('Cannot start recording because the render canvas is unavailable.');
    }

    if (typeof canvasElement.captureStream !== 'function') {
      throw new Error('Canvas capture is not supported in this browser.');
    }

    const canvasStream = canvasElement.captureStream(60);
    const videoTrack = canvasStream.getVideoTracks()[0];

    if (videoTrack === undefined || videoTrack.readyState !== 'live') {
      throw new Error('Render output stream is inactive and cannot be recorded.');
    }

    const combinedStream = new MediaStream([videoTrack]);
    const audioContext = await ensureAudioContext();

    if (audioContext !== null && audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const audioTrack = destinationStream
      ?.getAudioTracks()
      .find((track: MediaStreamTrack): boolean => track.readyState === 'live');

    if (audioTrack !== undefined) {
      try {
        combinedStream.addTrack(audioTrack.clone());
      } catch {
        // Recording continues with video only when the cloned audio track cannot be merged.
      }
    }

    return combinedStream;
  }, [canvasRef, destinationStream, ensureAudioContext]);

  const stopRecording = useCallback((): void => {
    cancelCountdown();

    const recorder = mediaRecorderRef.current;

    if (recorder !== null && recorder.state !== 'inactive') {
      recorder.stop();
      return;
    }

    recordingStreamRef.current?.getTracks().forEach((track: MediaStreamTrack): void => {
      track.stop();
    });
    recordingStreamRef.current = null;
  }, [cancelCountdown]);

  const releaseRecordingLiveInput = useCallback((): void => {
    void releaseLiveInputStream(recordingLiveInputOwnerId);
  }, [releaseLiveInputStream]);

  const resetMediaDatabase = useCallback(async (): Promise<void> => {
    try {
      stopRecording();
      await resetStoredMediaDatabase();
      await refreshMediaItems();
      setError(null);
    } catch (storageError: unknown) {
      setError(
        storageError instanceof Error
          ? storageError.message
          : 'Failed to reset the media database.',
      );
    }
  }, [refreshMediaItems, stopRecording]);

  const startTimelapseCapture = useCallback(async (): Promise<void> => {
    if (
      isRecording ||
      isProcessingCapture ||
      isBurstCapturing ||
      isCountingDown ||
      isTimelapseCapturing
    ) {
      return;
    }

    if (document.hidden) {
      setError('Timelapse capture can only start while this tab is visible.');
      return;
    }

    if (canvasRef.current === null) {
      setError('Cannot start timelapse because the render canvas is unavailable.');
      return;
    }

    setIsProcessingCapture(true);
    setError(null);

    try {
      const countdownCompleted = await runCountdown();

      if (!countdownCompleted) {
        return;
      }

      if (document.hidden) {
        setError('Timelapse start was cancelled because the tab became hidden.');
        return;
      }

      isTimelapseCapturingRef.current = true;
      setIsTimelapseCapturing(true);
      updateTimelapseState('running');
      updateTimelapseShotsCaptured(0);

      await captureTimelapseFrame();

      if (!isTimelapseCapturingRef.current) {
        return;
      }

      postTimelapseWorkerMessage({
        intervalMs: timelapseIntervalSecondsRef.current * 1000,
        type: 'START',
      });
    } catch (captureError: unknown) {
      setError(
        captureError instanceof Error
          ? captureError.message
          : 'Failed to start timelapse capture.',
      );
      stopTimelapseSession();
    } finally {
      setIsProcessingCapture(false);
    }
  }, [
    canvasRef,
    captureTimelapseFrame,
    isBurstCapturing,
    isCountingDown,
    isProcessingCapture,
    isRecording,
    isTimelapseCapturing,
    postTimelapseWorkerMessage,
    runCountdown,
    stopTimelapseSession,
    updateTimelapseShotsCaptured,
    updateTimelapseState,
  ]);

  const startRecording = useCallback(async (): Promise<void> => {
    if (isRecording || isProcessingCapture || isTimelapseCapturing) {
      return;
    }

    if (typeof MediaRecorder === 'undefined') {
      setError('MediaRecorder is not supported in this browser.');
      return;
    }

    setIsProcessingCapture(true);
    setError(null);
    let pendingRecordingId: string | null = null;

    try {
      const countdownCompleted = await runCountdown();

      if (!countdownCompleted) {
        return;
      }

      const canvasElement = canvasRef.current;

      if (canvasElement === null) {
        throw new Error('Cannot start recording because the render canvas is unavailable.');
      }

      await requestLiveInputStream(recordingLiveInputOwnerId);
      const combinedStream = await buildRecordingStream();
      const mimeType = getSupportedMimeType();
      const recorderOptions: MediaRecorderOptions =
        mimeType === undefined
          ? {
              videoBitsPerSecond: selectedProfile.videoBitsPerSecond,
            }
          : {
              mimeType,
              videoBitsPerSecond: selectedProfile.videoBitsPerSecond,
            };

      const recorder = new MediaRecorder(combinedStream, recorderOptions);
      const thumbnail = createThumbnail(canvasElement);
      const recordingWidth = canvasElement.width;
      const recordingHeight = canvasElement.height;
      const startedAt = Date.now();
      const recordingId = crypto.randomUUID();
      pendingRecordingId = recordingId;
      let nextChunkSequence = 0;
      let chunkPersistenceFailed = false;
      let chunkWriteChain = Promise.resolve();

      await createChunkedRecordingMedia({
        captureMode: 'recording',
        createdAt: startedAt,
        height: recordingHeight,
        id: recordingId,
        mimeType: recorder.mimeType || mimeType || 'video/webm',
        name: createMediaName('recording', recorder.mimeType || mimeType || 'video/webm', startedAt),
        origin: 'capture',
        ...(thumbnail === undefined ? {} : { thumbnail }),
        timestamp: startedAt,
        type: 'video',
        width: recordingWidth,
      });

      recordingStartedAtRef.current = startedAt;
      recordingStreamRef.current = combinedStream;
      mediaRecorderRef.current = recorder;
      setRecordingTime(0);
      setIsRecording(true);

      recorder.ondataavailable = (event: BlobEvent): void => {
        if (event.data.size <= 0 || chunkPersistenceFailed) {
          return;
        }

        const chunkSequence = nextChunkSequence;
        nextChunkSequence += 1;
        chunkWriteChain = chunkWriteChain
          .then(async (): Promise<void> => {
            await appendChunkedRecordingMediaChunk(recordingId, chunkSequence, event.data);
          })
          .catch((storageError: unknown): void => {
            chunkPersistenceFailed = true;
            setError(
              storageError instanceof Error
                ? storageError.message
                : 'Failed to persist a recording segment.',
            );

            if (recorder.state !== 'inactive') {
              recorder.stop();
            }
          });
      };

      recorder.onerror = (): void => {
        setError('The recording engine encountered an unexpected error.');
        setIsRecording(false);
        releaseRecordingLiveInput();
      };

      recorder.onstop = (): void => {
        const stoppedAt = Date.now();
        const currentRecordingStream = recordingStreamRef.current;

        void chunkWriteChain
          .then(async (): Promise<void> => {
            if (chunkPersistenceFailed) {
              await discardChunkedRecordingMedia(recordingId);
              return;
            }

            await finalizeChunkedRecordingMedia(recordingId, {
              durationMs: Math.max(0, stoppedAt - startedAt),
              timestamp: stoppedAt,
            });
            await refreshMediaItems();
          })
          .catch(async (storageError: unknown): Promise<void> => {
            setError(
              storageError instanceof Error
                ? storageError.message
                : 'Failed to finalize the recording session.',
            );
            await discardChunkedRecordingMedia(recordingId).catch((): void => undefined);
          })
          .finally((): void => {
            setIsRecording(false);
            setRecordingTime(0);
            mediaRecorderRef.current = null;
            recordingStartedAtRef.current = null;
            releaseRecordingLiveInput();

            if (currentRecordingStream !== null) {
              currentRecordingStream.getTracks().forEach((track: MediaStreamTrack): void => {
                track.stop();
              });
            }

            recordingStreamRef.current = null;
          });
      };

      recorder.start(1000);
      pendingRecordingId = null;
    } catch (recordingError: unknown) {
      recordingStreamRef.current?.getTracks().forEach((track: MediaStreamTrack): void => {
        track.stop();
      });
      recordingStreamRef.current = null;
      mediaRecorderRef.current = null;
      recordingStartedAtRef.current = null;
      setIsRecording(false);
      setRecordingTime(0);
      releaseRecordingLiveInput();
      if (pendingRecordingId !== null) {
        await discardChunkedRecordingMedia(pendingRecordingId).catch((): void => undefined);
      }
      setError(
        recordingError instanceof Error
          ? recordingError.message
          : 'Failed to start the recording session.',
      );
    } finally {
      setIsProcessingCapture(false);
    }
  }, [
    buildRecordingStream,
    canvasRef,
    isProcessingCapture,
    isRecording,
    isTimelapseCapturing,
    refreshMediaItems,
    releaseRecordingLiveInput,
    runCountdown,
    requestLiveInputStream,
    selectedProfile.videoBitsPerSecond,
  ]);

  const capturePhoto = useCallback(async (): Promise<void> => {
    if (isRecording || isProcessingCapture || isTimelapseCapturing) {
      return;
    }

    const canvasElement = canvasRef.current;

    if (canvasElement === null) {
      setError('Cannot capture a photo because the render canvas is unavailable.');
      return;
    }

    setIsProcessingCapture(true);
    setError(null);

    try {
      const countdownCompleted = await runCountdown();

      if (!countdownCompleted) {
        return;
      }

      const photoItem = await createSnapshotItem(canvasElement, 'photo');
      await persistMediaItems([photoItem]);
    } catch (captureError: unknown) {
      setError(captureError instanceof Error ? captureError.message : 'Failed to capture photo.');
    } finally {
      setIsProcessingCapture(false);
    }
  }, [
    canvasRef,
    createSnapshotItem,
    isProcessingCapture,
    isRecording,
    isTimelapseCapturing,
    persistMediaItems,
    runCountdown,
  ]);

  const captureBurst = useCallback(async (): Promise<void> => {
    if (isRecording || isProcessingCapture || isBurstCapturing || isTimelapseCapturing) {
      return;
    }

    const canvasElement = canvasRef.current;

    if (canvasElement === null) {
      setError('Cannot capture a burst because the render canvas is unavailable.');
      return;
    }

    setIsProcessingCapture(true);
    setIsBurstCapturing(true);
    setError(null);

    try {
      const countdownCompleted = await runCountdown();

      if (!countdownCompleted) {
        return;
      }

      const burstItems: MediaItem[] = [];

      for (let frameIndex = 0; frameIndex < burstCount; frameIndex += 1) {
        burstItems.push(await createSnapshotItem(canvasElement, 'burst'));

        if (frameIndex < burstCount - 1) {
          await delay(250);
        }
      }

      await persistMediaItems(burstItems);
    } catch (captureError: unknown) {
      setError(captureError instanceof Error ? captureError.message : 'Failed to capture burst images.');
    } finally {
      setIsBurstCapturing(false);
      setIsProcessingCapture(false);
    }
  }, [
    canvasRef,
    createSnapshotItem,
    burstCount,
    isBurstCapturing,
    isProcessingCapture,
    isRecording,
    isTimelapseCapturing,
    persistMediaItems,
    runCountdown,
  ]);

  const stopTimelapseCapture = useCallback((): void => {
    stopTimelapseSession();
  }, [stopTimelapseSession]);

  useEffect((): void => {
    void refreshMediaItems();
    void refreshCapturePresets();
  }, [refreshCapturePresets, refreshMediaItems]);

  useEffect((): void => {
    timelapseTickHandlerRef.current = (): void => {
      void captureTimelapseFrame();
    };
  }, [captureTimelapseFrame]);

  useEffect((): (() => void) => {
    const worker = new TimelapseTimerWorkerConstructor();
    timelapseWorkerRef.current = worker;

    worker.onmessage = (event: MessageEvent<TimelapseWorkerResponse>): void => {
      if (event.data.type !== 'TICK') {
        return;
      }

      timelapseTickHandlerRef.current?.();
    };

    return (): void => {
      worker.terminate();
      timelapseWorkerRef.current = null;
    };
  }, []);

  useEffect((): (() => void) => {
    const handleVisibilityChange = (): void => {
      if (!isTimelapseCapturingRef.current) {
        return;
      }

      if (document.hidden) {
        postTimelapseWorkerMessage({
          type: 'PAUSE',
        });
        updateTimelapseState('paused-hidden');
        return;
      }

      if (timelapseStateRef.current === 'paused-hidden') {
        updateTimelapseState('running');
        postTimelapseWorkerMessage({
          type: 'RESUME',
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return (): void => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [postTimelapseWorkerMessage, updateTimelapseState]);

  useEffect((): (() => void) | void => {
    if (!isRecording) {
      return undefined;
    }

    const intervalId = window.setInterval((): void => {
      const startedAt = recordingStartedAtRef.current;

      if (startedAt === null) {
        return;
      }

      setRecordingTime(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 250);

    return (): void => {
      window.clearInterval(intervalId);
    };
  }, [isRecording]);

  useEffect((): (() => void) => {
    return (): void => {
      cancelCountdown();
      mediaImportAbortControllerRef.current?.abort();
      postTimelapseWorkerMessage({
        type: 'STOP',
      });

      const recorder = mediaRecorderRef.current;

      if (recorder !== null && recorder.state !== 'inactive') {
        recorder.stop();
      }

      recordingStreamRef.current?.getTracks().forEach((track: MediaStreamTrack): void => {
        track.stop();
      });
      recordingStreamRef.current = null;
      releaseRecordingLiveInput();
      timelapseWorkerRef.current?.terminate();
      timelapseWorkerRef.current = null;
    };
  }, [cancelCountdown, postTimelapseWorkerMessage, releaseRecordingLiveInput]);

  const contextValue = useMemo<RecordingControllerContextValue>(
    (): RecordingControllerContextValue => ({
      applyCapturePreset,
      availableCapturePresets,
      availableProfiles: recordingProfiles,
      burstCount,
      captureBurst,
      capturePhoto,
      clearMediaLibrary,
      countdownRemaining,
      countdownSeconds,
      deleteMediaItem,
      deleteUserCapturePreset,
      error,
      importedMediaCapability,
      importMediaFromDisk,
      isBurstCapturing,
      isCountingDown,
      isImportingMedia,
      isProcessingCapture,
      isRecording,
      isTimelapseCapturing,
      mediaItems,
      recordingTime,
      refreshMediaItems,
      resetMediaDatabase,
      saveCurrentCapturePreset,
      selectedCapturePresetId,
      selectedProfileId,
      setBurstCount,
      setCountdownSeconds,
      setStillImageFormat,
      setRecordingProfileId,
      setTimelapseIntervalSeconds,
      setTimelapseMaxShots,
      startRecording,
      startTimelapseCapture,
      stillImageFormat,
      stopRecording,
      stopTimelapseCapture,
      storageStats,
      timelapseIntervalSeconds,
      timelapseMaxShots,
      timelapseShotsCaptured,
      timelapseState,
    }),
    [
      applyCapturePreset,
      availableCapturePresets,
      burstCount,
      captureBurst,
      capturePhoto,
      clearMediaLibrary,
      countdownRemaining,
      countdownSeconds,
      deleteMediaItem,
      deleteUserCapturePreset,
      error,
      importedMediaCapability,
      importMediaFromDisk,
      isBurstCapturing,
      isCountingDown,
      isImportingMedia,
      isProcessingCapture,
      isRecording,
      isTimelapseCapturing,
      mediaItems,
      recordingTime,
      refreshMediaItems,
      resetMediaDatabase,
      saveCurrentCapturePreset,
      selectedCapturePresetId,
      selectedProfileId,
      setBurstCount,
      setCountdownSeconds,
      setStillImageFormat,
      setRecordingProfileId,
      setTimelapseIntervalSeconds,
      setTimelapseMaxShots,
      startRecording,
      startTimelapseCapture,
      stillImageFormat,
      stopRecording,
      stopTimelapseCapture,
      storageStats,
      timelapseIntervalSeconds,
      timelapseMaxShots,
      timelapseShotsCaptured,
      timelapseState,
    ],
  );

  return (
    <RecordingControllerContext.Provider value={contextValue}>
      {children}
    </RecordingControllerContext.Provider>
  );
}

export function useRecordingController(): RecordingControllerContextValue {
  const contextValue = useContext(RecordingControllerContext);

  if (contextValue === null) {
    throw new Error('useRecordingController must be used within a RecordingController.');
  }

  return contextValue;
}
