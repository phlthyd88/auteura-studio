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
import { useCameraController } from './CameraController';
import { usePerformanceModeContext } from '../providers/PerformanceModeProvider';
import VisionWorkerConstructor from '../workers/VisionWorker?worker';
import {
  defaultBeautySettings,
  type BeautyRuntimeState,
  type BeautySettings,
} from '../types/beauty';
import type {
  CameraAssistPreset,
  CameraAssistPresetId,
} from '../types/cameraAssistPreset';
import {
  validateVisionRuntimeAssets,
  type VisionRuntimeAssetValidationResult,
} from '../services/ModelAssetService';
import { AIDiagnosticsService } from '../services/AIDiagnosticsService';
import {
  resetAIFrameState,
  setAIFrameState,
} from '../services/AIVisionStateStore';
import type {
  VisionEnabledFeatures,
  VisionFaceRegion,
  VisionFaceTrackingResult,
  VisionInferenceResults,
  VisionInitializationStage,
  VisionProcessingConfig,
  VisionRuntimeDiagnostics,
  VisionModelPaths,
  VisionWorkerMessage,
  VisionWorkerResponse,
} from '../types/vision';

interface AIControllerContextValue {
  readonly activeFeatures: VisionEnabledFeatures;
  readonly aiResults: VisionInferenceResults | null;
  readonly assetValidation: VisionRuntimeAssetValidationResult | null;
  readonly beautyAvailable: boolean;
  readonly beautyBlockReason: string | null;
  readonly beautyRuntime: BeautyRuntimeState;
  readonly beautySettings: BeautySettings;
  readonly backgroundBlurBlockReason: string | null;
  readonly backgroundBlurAvailable: boolean;
  readonly cameraAssistPresets: readonly CameraAssistPreset[];
  readonly currentCameraAssistPresetId: CameraAssistPresetId | null;
  readonly diagnostics: VisionRuntimeDiagnostics;
  readonly enabledFeatures: VisionEnabledFeatures;
  readonly initializationStage: VisionInitializationStage;
  readonly isInitializing: boolean;
  readonly isVisibilityPaused: boolean;
  readonly processingConfig: VisionProcessingConfig;
  readonly workerError: string | null;
  applyCameraAssistPreset: (presetId: CameraAssistPresetId) => void;
  refreshAssetValidation: () => Promise<void>;
  setBeautySettings: (nextSettings: BeautySettings) => void;
  setFeatureEnabled: (feature: keyof VisionEnabledFeatures, enabled: boolean) => void;
  setProcessingConfig: (nextConfig: VisionProcessingConfig) => void;
}

const defaultModelPaths: VisionModelPaths = {
  faceLandmarkerTaskPath: '/models/face_landmarker.task',
  imageSegmenterTaskPath: '/models/image_segmenter.task',
  wasmRootPath: '/models/wasm',
};

const initialVisionFeatures: VisionEnabledFeatures = {
  backgroundBlur: false,
  faceTracking: false,
};

const defaultProcessingConfig: VisionProcessingConfig = {
  backgroundBlurStrength: 0.65,
  frameSampleSize: 384,
  maxInferenceFps: 18,
  pauseWhenHidden: true,
};

const cameraAssistPresets: readonly CameraAssistPreset[] = [
  {
    beautySettings: {
      ...defaultBeautySettings,
      complexionBalancing: 0.35,
      detailPreservation: 0.68,
      enabled: true,
      previewBypassUnderLoad: true,
      skinSmoothing: 0.42,
      underEyeSoftening: 0.26,
    },
    description: 'Face tracking, portrait retouch, and moderate blur tuned for presenter shots.',
    enabledFeatures: {
      backgroundBlur: true,
      faceTracking: true,
    },
    id: 'portrait',
    label: 'Portrait',
    processingConfig: {
      backgroundBlurStrength: 0.58,
      frameSampleSize: 384,
      maxInferenceFps: 16,
      pauseWhenHidden: true,
    },
    renderSettings: {
      showFrameGuide: true,
      showGrid: false,
    },
  },
  {
    beautySettings: {
      ...defaultBeautySettings,
      enabled: false,
      previewBypassUnderLoad: true,
      skinSmoothing: 0.22,
    },
    description: 'A general-purpose live profile with face tracking and restrained processing.',
    enabledFeatures: {
      backgroundBlur: false,
      faceTracking: true,
    },
    id: 'balanced-live',
    label: 'Balanced Live',
    processingConfig: {
      backgroundBlurStrength: 0.4,
      frameSampleSize: 384,
      maxInferenceFps: 18,
      pauseWhenHidden: true,
    },
    renderSettings: {
      showFrameGuide: true,
      showGrid: false,
    },
  },
  {
    beautySettings: {
      ...defaultBeautySettings,
      enabled: false,
      previewBypassUnderLoad: true,
      skinSmoothing: 0.18,
      underEyeSoftening: 0.08,
    },
    description: 'Prioritizes steady preview performance on constrained hardware.',
    enabledFeatures: {
      backgroundBlur: false,
      faceTracking: true,
    },
    id: 'performance-safe',
    label: 'Performance Safe',
    processingConfig: {
      backgroundBlurStrength: 0.35,
      frameSampleSize: 320,
      maxInferenceFps: 10,
      pauseWhenHidden: true,
    },
    renderSettings: {
      showFrameGuide: true,
      showGrid: false,
    },
  },
];

const maxConsecutiveWorkerErrors = 5;

const AIControllerContext = createContext<AIControllerContextValue | null>(null);

function smoothPoint(
  previousPoint: { readonly x: number; readonly y: number },
  nextPoint: { readonly x: number; readonly y: number },
  blendFactor: number,
): { readonly x: number; readonly y: number } {
  const inverseBlend = 1 - blendFactor;

  return {
    x: previousPoint.x * inverseBlend + nextPoint.x * blendFactor,
    y: previousPoint.y * inverseBlend + nextPoint.y * blendFactor,
  };
}

function smoothFaceRegions(
  previousRegions: readonly VisionFaceRegion[],
  nextRegions: readonly VisionFaceRegion[],
): readonly VisionFaceRegion[] {
  if (previousRegions.length !== nextRegions.length) {
    return nextRegions;
  }

  const blendFactor = 0.35;
  const inverseBlend = 1 - blendFactor;

  return nextRegions.map((region: VisionFaceRegion, index: number): VisionFaceRegion => {
    const previousRegion = previousRegions[index];

    if (previousRegion === undefined || previousRegion.kind !== region.kind) {
      return region;
    }

    return {
      ...region,
      bounds: {
        center: smoothPoint(previousRegion.bounds.center, region.bounds.center, blendFactor),
        height: previousRegion.bounds.height * inverseBlend + region.bounds.height * blendFactor,
        maxX: previousRegion.bounds.maxX * inverseBlend + region.bounds.maxX * blendFactor,
        maxY: previousRegion.bounds.maxY * inverseBlend + region.bounds.maxY * blendFactor,
        minX: previousRegion.bounds.minX * inverseBlend + region.bounds.minX * blendFactor,
        minY: previousRegion.bounds.minY * inverseBlend + region.bounds.minY * blendFactor,
        width: previousRegion.bounds.width * inverseBlend + region.bounds.width * blendFactor,
      },
      confidence:
        previousRegion.confidence * inverseBlend + region.confidence * blendFactor,
    };
  });
}

function smoothFaces(
  previousFaces: readonly VisionFaceTrackingResult[],
  nextFaces: readonly VisionFaceTrackingResult[],
): readonly VisionFaceTrackingResult[] {
  if (previousFaces.length !== nextFaces.length) {
    return nextFaces;
  }

  const blendFactor = 0.35;
  const inverseBlend = 1 - blendFactor;

  return nextFaces.map((face: VisionFaceTrackingResult, faceIndex: number): VisionFaceTrackingResult => {
    const previousFace = previousFaces[faceIndex];

    if (
      previousFace === undefined ||
      previousFace.landmarks.length !== face.landmarks.length
    ) {
      return face;
    }

    return {
      ...face,
      landmarks: face.landmarks.map((landmark, landmarkIndex) => {
        const previousLandmark = previousFace.landmarks[landmarkIndex];

        if (previousLandmark === undefined) {
          return landmark;
        }

        return {
          visibility:
            previousLandmark.visibility * inverseBlend + landmark.visibility * blendFactor,
          x: previousLandmark.x * inverseBlend + landmark.x * blendFactor,
          y: previousLandmark.y * inverseBlend + landmark.y * blendFactor,
          z: previousLandmark.z * inverseBlend + landmark.z * blendFactor,
        };
      }),
      regions: smoothFaceRegions(previousFace.regions, face.regions),
    };
  });
}

function smoothInferenceResults(
  previousResults: VisionInferenceResults | null,
  nextResults: VisionInferenceResults,
): VisionInferenceResults {
  if (previousResults === null || previousResults.faces.length === 0) {
    return nextResults;
  }

  return {
    ...nextResults,
    faces: smoothFaces(previousResults.faces, nextResults.faces),
  };
}

export function AIController({ children }: PropsWithChildren): JSX.Element {
  const { videoRef } = useCameraController();
  const { capabilities } = usePerformanceModeContext();
  const workerRef = useRef<Worker | null>(null);
  const aiResultsRef = useRef<VisionInferenceResults | null>(null);
  const workerReadyRef = useRef<boolean>(false);
  const workerBusyRef = useRef<boolean>(false);
  const bitmapCreationInFlightRef = useRef<boolean>(false);
  const animationFrameRef = useRef<number | null>(null);
  const initializationTimeoutRef = useRef<number | null>(null);
  const bootAttemptRef = useRef<number>(0);
  const requestIdRef = useRef<number>(0);
  const lastQueuedVideoTimeRef = useRef<number>(-1);
  const lastSubmittedAtRef = useRef<number>(0);
  const enabledFeaturesRef = useRef<VisionEnabledFeatures>(initialVisionFeatures);
  const processingConfigRef = useRef<VisionProcessingConfig>(defaultProcessingConfig);
  const diagnosticsServiceRef = useRef<AIDiagnosticsService>(new AIDiagnosticsService());
  const [aiResults, setAIResults] = useState<VisionInferenceResults | null>(null);
  const [assetValidation, setAssetValidation] = useState<VisionRuntimeAssetValidationResult | null>(
    null,
  );
  const [diagnostics, setDiagnostics] = useState<VisionRuntimeDiagnostics>(
    diagnosticsServiceRef.current.getSnapshot(),
  );
  const [initializationStage, setInitializationStage] =
    useState<VisionInitializationStage>('idle');
  const [isInitializing, setIsInitializing] = useState<boolean>(false);
  const [isVisibilityPaused, setIsVisibilityPaused] = useState<boolean>(false);
  const [workerError, setWorkerError] = useState<string | null>(null);
  const [enabledFeatures, setEnabledFeatures] =
    useState<VisionEnabledFeatures>(initialVisionFeatures);
  const [beautySettings, setBeautySettingsState] =
    useState<BeautySettings>(defaultBeautySettings);
  const [processingConfig, setProcessingConfigState] =
    useState<VisionProcessingConfig>(defaultProcessingConfig);
  const effectiveEnabledFeatures = useMemo<VisionEnabledFeatures>(
    (): VisionEnabledFeatures => ({
      backgroundBlur: enabledFeatures.backgroundBlur && capabilities.allowBackgroundBlur,
      faceTracking: enabledFeatures.faceTracking,
    }),
    [capabilities.allowBackgroundBlur, enabledFeatures.backgroundBlur, enabledFeatures.faceTracking],
  );
  const effectiveProcessingConfig = useMemo<VisionProcessingConfig>(
    (): VisionProcessingConfig => ({
      ...processingConfig,
      backgroundBlurStrength: capabilities.allowBackgroundBlur
        ? processingConfig.backgroundBlurStrength
        : 0,
      frameSampleSize: (() : number => {
        if (effectiveEnabledFeatures.backgroundBlur) {
          return capabilities.qualityScale < 1 ? 320 : 384;
        }

        return capabilities.qualityScale < 1 ? 384 : 512;
      })(),
      maxInferenceFps: Math.min(
        processingConfig.maxInferenceFps,
        capabilities.aiFrameRateCap,
        effectiveEnabledFeatures.backgroundBlur
          ? capabilities.qualityScale < 1
            ? 8
            : 12
          : 18,
      ),
    }),
    [
      capabilities.aiFrameRateCap,
      capabilities.allowBackgroundBlur,
      capabilities.qualityScale,
      effectiveEnabledFeatures.backgroundBlur,
      processingConfig,
    ],
  );
  const anyFeatureEnabled =
    effectiveEnabledFeatures.backgroundBlur || effectiveEnabledFeatures.faceTracking;
  const beautyAvailable =
    capabilities.qualityScale >= 0.75 &&
    (!capabilities.bypassHeavyPreviewPasses || !beautySettings.previewBypassUnderLoad);
  const beautyPreviewBypassed =
    beautySettings.enabled &&
    beautySettings.previewBypassUnderLoad &&
    capabilities.bypassHeavyPreviewPasses;
  const beautyBlockReason =
    !beautySettings.enabled
      ? null
      : beautyPreviewBypassed
        ? 'Portrait retouch is bypassed while preview performance protections are active.'
        : !beautyAvailable
          ? 'Portrait retouch is unavailable at the current preview quality tier.'
          : null;
  const beautyRuntime = useMemo<BeautyRuntimeState>(
    (): BeautyRuntimeState => ({
      active: beautySettings.enabled && beautyBlockReason === null,
      previewBypassed: beautyPreviewBypassed,
      quality: capabilities.qualityScale >= 1 ? 'full' : 'reduced',
      settings: beautySettings,
      unavailableReason: beautyBlockReason,
    }),
    [beautyBlockReason, beautyPreviewBypassed, beautySettings, capabilities.qualityScale],
  );
  const backgroundBlurAvailable = capabilities.allowBackgroundBlur;
  const backgroundBlurBlockReason =
    enabledFeatures.backgroundBlur && !effectiveEnabledFeatures.backgroundBlur
      ? 'Background blur is currently disabled by the active performance guardrails.'
      : null;

  const updateDiagnostics = useCallback((nextDiagnostics: VisionRuntimeDiagnostics): void => {
    setDiagnostics(nextDiagnostics);
  }, []);

  const setFeatureEnabled = useCallback(
    (feature: keyof VisionEnabledFeatures, enabled: boolean): void => {
      setEnabledFeatures(
        (currentFeatures: VisionEnabledFeatures): VisionEnabledFeatures => ({
          ...currentFeatures,
          [feature]: enabled,
        }),
      );
    },
    [],
  );

  const setProcessingConfig = useCallback((nextConfig: VisionProcessingConfig): void => {
    processingConfigRef.current = nextConfig;
    setProcessingConfigState(nextConfig);
  }, []);

  const setBeautySettings = useCallback((nextSettings: BeautySettings): void => {
    setBeautySettingsState(nextSettings);
  }, []);

  const currentCameraAssistPresetId = useMemo<CameraAssistPresetId | null>(
    (): CameraAssistPresetId | null =>
      cameraAssistPresets.find(
        (preset: CameraAssistPreset): boolean =>
          preset.enabledFeatures.backgroundBlur === enabledFeatures.backgroundBlur &&
          preset.enabledFeatures.faceTracking === enabledFeatures.faceTracking &&
          preset.processingConfig.maxInferenceFps === processingConfig.maxInferenceFps &&
          preset.processingConfig.pauseWhenHidden === processingConfig.pauseWhenHidden &&
          preset.beautySettings.enabled === beautySettings.enabled &&
          Math.abs(
            preset.beautySettings.skinSmoothing - beautySettings.skinSmoothing,
          ) < 0.001,
      )?.id ?? null,
    [beautySettings, enabledFeatures, processingConfig],
  );

  const applyCameraAssistPreset = useCallback((presetId: CameraAssistPresetId): void => {
    const preset = cameraAssistPresets.find(
      (candidate: CameraAssistPreset): boolean => candidate.id === presetId,
    );

    if (preset === undefined) {
      return;
    }

    setEnabledFeatures(preset.enabledFeatures);
    setBeautySettingsState(preset.beautySettings);
    processingConfigRef.current = preset.processingConfig;
    setProcessingConfigState(preset.processingConfig);
  }, []);

  useEffect((): void => {
    aiResultsRef.current = aiResults;
  }, [aiResults]);

  useEffect((): void => {
    enabledFeaturesRef.current = effectiveEnabledFeatures;
    setAIFrameState({
      beautyRuntime,
      beautySettings,
      enabledFeatures: effectiveEnabledFeatures,
      processingConfig: effectiveProcessingConfig,
      results: aiResults,
    });
  }, [aiResults, beautyRuntime, beautySettings, effectiveEnabledFeatures, effectiveProcessingConfig]);

  useEffect((): void => {
    processingConfigRef.current = effectiveProcessingConfig;
    setAIFrameState({
      beautyRuntime,
      beautySettings,
      enabledFeatures: enabledFeaturesRef.current,
      processingConfig: effectiveProcessingConfig,
      results: aiResultsRef.current,
    });
  }, [beautyRuntime, beautySettings, effectiveProcessingConfig]);

  useEffect((): (() => void) => {
    function handleVisibilityChange(): void {
      const nextPaused =
        processingConfigRef.current.pauseWhenHidden &&
        typeof document !== 'undefined' &&
        document.visibilityState === 'hidden';

      setIsVisibilityPaused(nextPaused);
    }

    handleVisibilityChange();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return (): void => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const clearInitializationTimeout = useCallback((): void => {
    if (initializationTimeoutRef.current !== null) {
      window.clearTimeout(initializationTimeoutRef.current);
      initializationTimeoutRef.current = null;
    }
  }, []);

  const refreshAssetValidation = useCallback(async (): Promise<void> => {
    const validationResult = await validateVisionRuntimeAssets(defaultModelPaths);
    setAssetValidation(validationResult);
  }, []);

  const terminateWorker = useCallback((): void => {
    clearInitializationTimeout();

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    const worker = workerRef.current;

    if (worker !== null) {
      try {
        const disposeMessage: VisionWorkerMessage = {
          type: 'DISPOSE',
        };
        worker.postMessage(disposeMessage);
      } catch {
        // Termination still proceeds even if the worker can no longer receive messages.
      }

      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      workerRef.current = null;
    }

    workerReadyRef.current = false;
    workerBusyRef.current = false;
    bitmapCreationInFlightRef.current = false;
    lastQueuedVideoTimeRef.current = -1;
    lastSubmittedAtRef.current = 0;
  }, [clearInitializationTimeout]);

  const disableAIWithError = useCallback(
    (message: string): void => {
      terminateWorker();
      setEnabledFeatures(initialVisionFeatures);
      setAIResults(null);
      setWorkerError(message);
      setInitializationStage('error');
      setIsInitializing(false);
      resetAIFrameState();
    },
    [terminateWorker],
  );

  const recordWorkerError = useCallback(
    (message: string, requestId: number | null): void => {
      const nextDiagnostics = diagnosticsServiceRef.current.recordWorkerError();
      updateDiagnostics(nextDiagnostics);
      setWorkerError(message);

      if (requestId === null) {
        setInitializationStage('error');
        setIsInitializing(false);
      }

      if (nextDiagnostics.consecutiveWorkerErrors >= maxConsecutiveWorkerErrors) {
        disableAIWithError(
          'Vision processing paused after repeated worker errors. Re-enable AI to retry.',
        );
      }
    },
    [disableAIWithError, updateDiagnostics],
  );

  useEffect((): (() => void) => {
    if (!anyFeatureEnabled) {
      terminateWorker();
      setAIResults(null);
      setInitializationStage('idle');
      setIsInitializing(false);
      setWorkerError(null);
      updateDiagnostics(diagnosticsServiceRef.current.reset());
      resetAIFrameState();
      return (): void => undefined;
    }

    let isDisposed = false;
    const bootAttempt = bootAttemptRef.current + 1;
    bootAttemptRef.current = bootAttempt;

    async function startVisionRuntime(): Promise<void> {
      setIsInitializing(true);
      setWorkerError(null);
      setInitializationStage('validating-assets');
      updateDiagnostics(diagnosticsServiceRef.current.reset());

      const validationResult = await validateVisionRuntimeAssets(defaultModelPaths);

      if (isDisposed || bootAttemptRef.current !== bootAttempt) {
        return;
      }

      setAssetValidation(validationResult);

      if (!validationResult.ok) {
        setInitializationStage('error');
        setIsInitializing(false);
        setWorkerError(validationResult.summary);
        return;
      }

      if (typeof Worker === 'undefined') {
        setInitializationStage('error');
        setIsInitializing(false);
        setWorkerError('Web Workers are not available in this browser.');
        return;
      }

      if (typeof createImageBitmap !== 'function') {
        setInitializationStage('error');
        setIsInitializing(false);
        setWorkerError('ImageBitmap creation is not available in this browser.');
        return;
      }

      setInitializationStage('starting-worker');

      let worker: Worker;

      try {
        worker = new VisionWorkerConstructor({
          name: 'auteura-vision-worker',
        });
      } catch (error) {
        setInitializationStage('error');
        setIsInitializing(false);
        setWorkerError(
          error instanceof Error
            ? error.message
            : 'The vision worker could not be constructed.',
        );
        return;
      }

      if (isDisposed || bootAttemptRef.current !== bootAttempt) {
        worker.terminate();
        return;
      }

      workerRef.current = worker;
      workerReadyRef.current = false;
      workerBusyRef.current = false;
      bitmapCreationInFlightRef.current = false;
      setInitializationStage('initializing-models');

      clearInitializationTimeout();
      initializationTimeoutRef.current = window.setTimeout((): void => {
        if (bootAttemptRef.current !== bootAttempt || workerReadyRef.current) {
          return;
        }

        terminateWorker();
        setInitializationStage('error');
        setIsInitializing(false);
        setWorkerError('Vision worker initialization timed out.');
      }, 15000);

      worker.onmessage = (event: MessageEvent<VisionWorkerResponse>): void => {
        const message = event.data;

        if (message.type === 'INIT_SUCCESS') {
          clearInitializationTimeout();
          workerReadyRef.current = true;
          workerBusyRef.current = false;
          setInitializationStage('ready');
          setIsInitializing(false);
          setWorkerError(null);
          return;
        }

        if (message.type === 'INIT_ERROR') {
          clearInitializationTimeout();
          workerBusyRef.current = false;
          workerReadyRef.current = false;
          setInitializationStage('error');
          setIsInitializing(false);
          setWorkerError(message.payload.message);
          return;
        }

        if (message.type === 'RESULTS') {
          workerBusyRef.current = false;
          const smoothedResults = smoothInferenceResults(aiResultsRef.current, message.payload);
          aiResultsRef.current = smoothedResults;
          setAIResults(smoothedResults);
          updateDiagnostics(
            diagnosticsServiceRef.current.recordSuccess(
              smoothedResults.processingDurationMs,
              performance.now(),
            ),
          );
          return;
        }

        workerBusyRef.current = false;
        recordWorkerError(message.payload.message, message.payload.requestId);
      };

      worker.onerror = (event: ErrorEvent): void => {
        clearInitializationTimeout();
        workerBusyRef.current = false;
        workerReadyRef.current = false;
        setInitializationStage('error');
        setIsInitializing(false);
        recordWorkerError(
          event.message || 'The vision worker encountered an unexpected error.',
          null,
        );
      };

      const initMessage: VisionWorkerMessage = {
        payload: {
          enabledFeatures: enabledFeaturesRef.current,
          modelPaths: defaultModelPaths,
        },
        type: 'INIT',
      };

      worker.postMessage(initMessage);
    }

    void startVisionRuntime();

    return (): void => {
      isDisposed = true;
      bootAttemptRef.current += 1;
      terminateWorker();
    };
  }, [
    anyFeatureEnabled,
    clearInitializationTimeout,
    recordWorkerError,
    terminateWorker,
    updateDiagnostics,
  ]);

  useEffect((): void => {
    const worker = workerRef.current;

    if (worker === null || !workerReadyRef.current) {
      return;
    }

    const configMessage: VisionWorkerMessage = {
        payload: {
          enabledFeatures: effectiveEnabledFeatures,
          processingConfig: effectiveProcessingConfig,
        },
      type: 'SET_CONFIG',
    };

    worker.postMessage(configMessage);
  }, [effectiveEnabledFeatures, effectiveProcessingConfig]);

  useEffect((): (() => void) => {
    const videoElement = videoRef.current;

    if (videoElement === null) {
      return (): void => undefined;
    }

    if (!anyFeatureEnabled) {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      workerBusyRef.current = false;
      bitmapCreationInFlightRef.current = false;
      lastQueuedVideoTimeRef.current = -1;
      setAIResults(null);
      return (): void => undefined;
    }

    let isCancelled = false;
    const trackedVideoElement = videoElement;

    function scheduleNextFrame(): void {
      animationFrameRef.current = requestAnimationFrame(pumpFrame);
    }

    function pumpFrame(): void {
      if (isCancelled) {
        return;
      }

      const worker = workerRef.current;

      if (processingConfigRef.current.pauseWhenHidden && document.visibilityState === 'hidden') {
        if (!isVisibilityPaused) {
          setIsVisibilityPaused(true);
        }

        updateDiagnostics(diagnosticsServiceRef.current.recordHiddenSkip());
        scheduleNextFrame();
        return;
      }

      if (isVisibilityPaused) {
        setIsVisibilityPaused(false);
      }

      if (worker === null || !workerReadyRef.current || isInitializing) {
        updateDiagnostics(diagnosticsServiceRef.current.recordNotReadySkip());
        scheduleNextFrame();
        return;
      }

      if (workerBusyRef.current || bitmapCreationInFlightRef.current) {
        updateDiagnostics(diagnosticsServiceRef.current.recordBusyDrop());
        scheduleNextFrame();
        return;
      }

      if (trackedVideoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        updateDiagnostics(diagnosticsServiceRef.current.recordNotReadySkip());
        scheduleNextFrame();
        return;
      }

      if (trackedVideoElement.currentTime === lastQueuedVideoTimeRef.current) {
        updateDiagnostics(diagnosticsServiceRef.current.recordDuplicateSkip());
        scheduleNextFrame();
        return;
      }

      const minFrameSpacingMs = 1000 / processingConfigRef.current.maxInferenceFps;
      const now = performance.now();

      if (now - lastSubmittedAtRef.current < minFrameSpacingMs) {
        updateDiagnostics(diagnosticsServiceRef.current.recordCadenceSkip());
        scheduleNextFrame();
        return;
      }

      bitmapCreationInFlightRef.current = true;
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      lastQueuedVideoTimeRef.current = trackedVideoElement.currentTime;
      lastSubmittedAtRef.current = now;
      updateDiagnostics(diagnosticsServiceRef.current.recordSubmit(now));

      const sourceWidth = trackedVideoElement.videoWidth;
      const sourceHeight = trackedVideoElement.videoHeight;
      const targetLongEdge = processingConfigRef.current.frameSampleSize;
      const shouldResize =
        sourceWidth > 0 &&
        sourceHeight > 0 &&
        Math.max(sourceWidth, sourceHeight) > targetLongEdge;
      const targetWidth =
        !shouldResize || sourceWidth === 0 || sourceHeight === 0
          ? sourceWidth
          : sourceWidth >= sourceHeight
            ? targetLongEdge
            : Math.max(1, Math.round((sourceWidth / sourceHeight) * targetLongEdge));
      const targetHeight =
        !shouldResize || sourceWidth === 0 || sourceHeight === 0
          ? sourceHeight
          : sourceHeight > sourceWidth
            ? targetLongEdge
            : Math.max(1, Math.round((sourceHeight / sourceWidth) * targetLongEdge));

      void createImageBitmap(
        trackedVideoElement,
        shouldResize
          ? {
              resizeHeight: targetHeight,
              resizeQuality: 'low',
              resizeWidth: targetWidth,
            }
          : undefined,
      )
        .then((frameBitmap: ImageBitmap): void => {
          if (
            isCancelled ||
            workerRef.current === null ||
            !workerReadyRef.current ||
            workerBusyRef.current
          ) {
            frameBitmap.close();
            return;
          }

          const processMessage: VisionWorkerMessage = {
            payload: {
              frame: frameBitmap,
              frameType: 'image-bitmap',
              requestId,
              timestamp: now,
            },
            type: 'PROCESS_FRAME',
          };

          workerBusyRef.current = true;
          workerRef.current.postMessage(processMessage, [frameBitmap]);
        })
        .catch((error: Error | DOMException): void => {
          workerBusyRef.current = false;
          recordWorkerError(error.message, requestId);
        })
        .finally((): void => {
          bitmapCreationInFlightRef.current = false;
          scheduleNextFrame();
        });
    }

    scheduleNextFrame();

    return (): void => {
      isCancelled = true;

      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [
    anyFeatureEnabled,
    isInitializing,
    isVisibilityPaused,
    recordWorkerError,
    updateDiagnostics,
    videoRef,
  ]);

  const contextValue = useMemo<AIControllerContextValue>(
    (): AIControllerContextValue => ({
      activeFeatures: effectiveEnabledFeatures,
      aiResults,
      applyCameraAssistPreset,
      assetValidation,
      beautyAvailable,
      beautyBlockReason,
      beautyRuntime,
      beautySettings,
      backgroundBlurAvailable,
      backgroundBlurBlockReason,
      cameraAssistPresets,
      currentCameraAssistPresetId,
      diagnostics,
      enabledFeatures,
      initializationStage,
      isInitializing,
      isVisibilityPaused,
      processingConfig,
      refreshAssetValidation,
      setBeautySettings,
      setFeatureEnabled,
      setProcessingConfig,
      workerError,
    }),
    [
      applyCameraAssistPreset,
      beautyAvailable,
      beautyBlockReason,
      beautyRuntime,
      beautySettings,
      backgroundBlurAvailable,
      backgroundBlurBlockReason,
      currentCameraAssistPresetId,
      effectiveEnabledFeatures,
      aiResults,
      assetValidation,
      diagnostics,
      enabledFeatures,
      initializationStage,
      isInitializing,
      isVisibilityPaused,
      processingConfig,
      refreshAssetValidation,
      setBeautySettings,
      setFeatureEnabled,
      setProcessingConfig,
      workerError,
    ],
  );

  return <AIControllerContext.Provider value={contextValue}>{children}</AIControllerContext.Provider>;
}

export function useAIController(): AIControllerContextValue {
  const contextValue = useContext(AIControllerContext);

  if (contextValue === null) {
    throw new Error('useAIController must be used within an AIController.');
  }

  return contextValue;
}
