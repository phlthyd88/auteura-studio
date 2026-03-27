import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PropsWithChildren,
} from 'react';
import { useAudioContext } from '../context/AudioContext';
import { useCameraController } from './CameraController';
import { GLRenderer } from '../engine/GLRenderer';
import type { GLRendererDiagnostics, GLRendererFailureReason } from '../engine/GLRenderer';
import {
  CompositionRenderAdapter,
  type CompositionRenderState,
} from '../engine/render/CompositionRenderAdapter';
import { createStudioRenderer } from '../engine/createStudioRenderer';
import { defaultBeautyRuntimeState } from '../types/beauty';
import type { CameraAssistRenderSettings } from '../types/cameraAssistPreset';
import {
  type RenderAIState,
  type RenderComparisonConfig,
  type RenderMaskRefinementConfig,
  type OverlayConfig,
  defaultRenderComparisonConfig,
  defaultRenderMaskRefinementConfig,
  defaultRenderPassDirectives,
  RenderMode,
  renderModeOrder,
} from '../types/render';
import {
  defaultPictureInPictureConfig,
  type PictureInPictureConfig,
} from '../types/compositor';
import {
  defaultColorGradingSettings,
  defaultTransformSettings,
  normalizeTransformSettings,
  type ColorGradingSettings,
  type LoadedLut,
  type LutDefinition,
  type TransformSettings,
} from '../types/color';
import type { LookPresetRecord, LookPresetSettings } from '../types/lookPreset';
import {
  deleteImportedLut,
  getAvailableLuts,
  getBundledLuts,
  importLutFile as importCustomLutFile,
  loadLutById,
} from '../services/LutService';
import {
  deleteLookPreset as deleteStoredLookPreset,
  listLookPresets,
  saveLookPreset,
} from '../services/LookPresetStorageService';
import {
  getAIFrameState,
  subscribeToAIFrameState,
  type SharedAIFrameState,
} from '../services/AIVisionStateStore';
import {
  getTimelinePreviewState,
  subscribeToTimelinePreviewState,
  type TimelinePreviewMode,
  type TimelinePreviewState,
} from '../services/TimelinePreviewStore';
import { usePerformanceModeContext } from '../providers/PerformanceModeProvider';
import {
  emptySceneAnalysis,
  SceneAnalysisService,
  type SceneAnalysisSnapshot,
} from '../services/SceneAnalysisService';
import {
  AuteuraVirtualOutputService,
  defaultVirtualOutputSnapshot,
  resolveVirtualOutputDeliveryPolicy,
} from '../services/AuteuraVirtualOutputService';
import { AuteuraVirtualOutputBridgeService } from '../services/AuteuraVirtualOutputBridgeService';
import type { VirtualOutputStatusSnapshot } from '../types/virtualOutput';

interface RenderControllerContextValue {
  readonly activeLutId: string | null;
  readonly availableLuts: readonly LutDefinition[];
  readonly canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  readonly colorGrading: ColorGradingSettings;
  readonly comparisonConfig: RenderComparisonConfig;
  readonly deleteImportedLut: (lutId: string) => Promise<void>;
  readonly deleteLookPreset: (presetId: string) => Promise<void>;
  readonly importLutFile: (file: File) => Promise<void>;
  readonly isLutLoading: boolean;
  readonly isLutImporting: boolean;
  readonly isContextLost: boolean;
  readonly isLookPresetSaving: boolean;
  readonly lutImportError: string | null;
  readonly lutLoadError: string | null;
  readonly lookPresets: readonly LookPresetRecord[];
  readonly maskRefinementConfig: RenderMaskRefinementConfig;
  readonly mode: RenderMode;
  readonly overlayConfig: OverlayConfig;
  readonly pictureInPictureConfig: PictureInPictureConfig;
  readonly previewSourceMode: TimelinePreviewMode;
  readonly previewStatus: TimelinePreviewState['status'];
  readonly rendererRuntime: RendererRuntimeState;
  readonly rendererError: string | null;
  readonly webglDiagnostics: WebglDiagnostics;
  readonly sceneAnalysis: SceneAnalysisSnapshot;
  readonly transform: TransformSettings;
  readonly virtualOutputStatus: VirtualOutputStatusSnapshot;
  bindTimelineSource: (sourceId: string, sourceElement: HTMLImageElement | HTMLVideoElement | null) => void;
  cycleRenderMode: () => void;
  applyLookPreset: (presetId: string) => Promise<void>;
  resetRenderSettings: () => void;
  saveCurrentLookPreset: (name: string) => Promise<void>;
  setActiveLutId: (nextLutId: string | null) => Promise<void>;
  setColorGrading: (nextSettings: ColorGradingSettings) => void;
  setComparisonConfig: (nextConfig: RenderComparisonConfig) => void;
  setMaskRefinementConfig: (nextConfig: RenderMaskRefinementConfig) => void;
  setMode: (nextMode: RenderMode) => void;
  setOverlayConfig: (nextConfig: OverlayConfig) => void;
  setPictureInPictureConfig: (nextConfig: PictureInPictureConfig) => void;
  setTransform: (nextSettings: TransformSettings) => void;
  applyCameraAssistRenderSettings: (nextSettings: CameraAssistRenderSettings) => void;
}

const RenderControllerContext = createContext<RenderControllerContextValue | null>(null);

const defaultRenderAIState: RenderAIState = {
  backgroundBlurEnabled: false,
  backgroundBlurStrength: 0.65,
  beauty: defaultBeautyRuntimeState,
  faceRegions: [],
  segmentationMask: null,
};

const defaultTimelinePreviewState: TimelinePreviewState = {
  activeClipId: null,
  activeSources: {},
  clipOffsetMs: 0,
  composition: null,
  isPlaying: false,
  mode: 'live',
  status: 'idle',
};

type WebglDiagnostics = GLRendererDiagnostics;
export type RendererRuntimeReason =
  | GLRendererFailureReason
  | 'context-lost'
  | 'render-loop-failed'
  | 'renderer-unavailable';

type RendererRuntimeStatus = 'context-lost' | 'error' | 'fallback' | 'idle' | 'ready';

interface RendererRuntimeState {
  readonly diagnostics: WebglDiagnostics;
  readonly isContextLost: boolean;
  readonly message: string | null;
  readonly reason: RendererRuntimeReason | null;
  readonly status: RendererRuntimeStatus;
}

const defaultWebglDiagnostics: WebglDiagnostics = {
  apiExposed: typeof WebGLRenderingContext !== 'undefined',
  backend: 'unavailable',
  experimentalContextAvailable: false,
  failureReason: null,
  message: null,
  webglContextAvailable: false,
};

const defaultRendererRuntimeState: RendererRuntimeState = {
  diagnostics: defaultWebglDiagnostics,
  isContextLost: false,
  message: null,
  reason: null,
  status: 'idle',
};

function createRenderer(canvas: HTMLCanvasElement): GLRenderer {
  return createStudioRenderer(canvas);
}

function areWebglDiagnosticsEqual(
  left: WebglDiagnostics,
  right: WebglDiagnostics,
): boolean {
  return (
    left.backend === right.backend &&
    left.message === right.message &&
    left.failureReason === right.failureReason &&
    left.apiExposed === right.apiExposed &&
    left.webglContextAvailable === right.webglContextAvailable &&
    left.experimentalContextAvailable === right.experimentalContextAvailable
  );
}

function deriveRendererRuntimeStateFromDiagnostics(
  nextDiagnostics: WebglDiagnostics,
): RendererRuntimeState {
  if (nextDiagnostics.backend === 'webgl') {
    return {
      diagnostics: nextDiagnostics,
      isContextLost: false,
      message: null,
      reason: null,
      status: 'ready',
    };
  }

  return {
    diagnostics: nextDiagnostics,
    isContextLost: false,
    message: nextDiagnostics.message,
    reason: nextDiagnostics.failureReason,
    status: nextDiagnostics.backend === 'canvas-2d' ? 'fallback' : 'error',
  };
}

function areRendererRuntimeStatesEqual(
  left: RendererRuntimeState,
  right: RendererRuntimeState,
): boolean {
  return (
    left.status === right.status &&
    left.reason === right.reason &&
    left.message === right.message &&
    left.isContextLost === right.isContextLost &&
    areWebglDiagnosticsEqual(left.diagnostics, right.diagnostics)
  );
}

export function RenderController({ children }: PropsWithChildren): JSX.Element {
  const { currentSettings, videoRef } = useCameraController();
  const { destinationStream } = useAudioContext();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const activeLutRef = useRef<LoadedLut | null>(null);
  const colorGradingRef = useRef<ColorGradingSettings>(defaultColorGradingSettings);
  const contextLostRef = useRef<boolean>(false);
  const comparisonConfigRef = useRef<RenderComparisonConfig>(defaultRenderComparisonConfig);
  const maskRefinementConfigRef = useRef<RenderMaskRefinementConfig>(
    defaultRenderMaskRefinementConfig,
  );
  const pictureInPictureConfigRef = useRef<PictureInPictureConfig>(defaultPictureInPictureConfig);
  const lutRequestIdRef = useRef<number>(0);
  const rendererRef = useRef<GLRenderer | null>(null);
  const compositionAdapterRef = useRef<CompositionRenderAdapter>(new CompositionRenderAdapter());
  const modeRef = useRef<RenderMode>(RenderMode.Passthrough);
  const timelinePreviewStateRef = useRef<TimelinePreviewState>(defaultTimelinePreviewState);
  const transformRef = useRef<TransformSettings>(defaultTransformSettings);
  const aiStateRef = useRef<RenderAIState>(defaultRenderAIState);
  const aiFrameStateRef = useRef<SharedAIFrameState>(getAIFrameState());
  const performanceStateRef = useRef<{
    readonly bypassHeavyPreviewPasses: boolean;
    readonly qualityScale: number;
  }>({
    bypassHeavyPreviewPasses: false,
    qualityScale: 1,
  });
  const sceneAnalysisServiceRef = useRef<SceneAnalysisService | null>(null);
  const virtualOutputServiceRef = useRef<AuteuraVirtualOutputService>(
    new AuteuraVirtualOutputService(),
  );
  const virtualOutputBridgeServiceRef = useRef<AuteuraVirtualOutputBridgeService>(
    new AuteuraVirtualOutputBridgeService(virtualOutputServiceRef.current),
  );
  const [activeLutId, setActiveLutIdState] = useState<string | null>(null);
  const [activeLut, setActiveLut] = useState<LoadedLut | null>(null);
  const [colorGrading, setColorGradingState] =
    useState<ColorGradingSettings>(defaultColorGradingSettings);
  const [comparisonConfig, setComparisonConfigState] =
    useState<RenderComparisonConfig>(defaultRenderComparisonConfig);
  const [maskRefinementConfig, setMaskRefinementConfigState] =
    useState<RenderMaskRefinementConfig>(defaultRenderMaskRefinementConfig);
  const [pictureInPictureConfig, setPictureInPictureConfigState] =
    useState<PictureInPictureConfig>(defaultPictureInPictureConfig);
  const [availableLuts, setAvailableLuts] =
    useState<readonly LutDefinition[]>(getBundledLuts());
  const [isLutLoading, setIsLutLoading] = useState<boolean>(false);
  const [isLutImporting, setIsLutImporting] = useState<boolean>(false);
  const [isLookPresetSaving, setIsLookPresetSaving] = useState<boolean>(false);
  const [mode, setModeState] = useState<RenderMode>(RenderMode.Passthrough);
  const [overlayConfig, setOverlayConfigState] = useState<OverlayConfig>({
    showFrameGuide: true,
    showGrid: false,
  });
  const [previewSourceMode, setPreviewSourceMode] = useState<TimelinePreviewMode>('live');
  const [previewStatus, setPreviewStatus] =
    useState<TimelinePreviewState['status']>('idle');
  const [lutImportError, setLutImportError] = useState<string | null>(null);
  const [lutLoadError, setLutLoadError] = useState<string | null>(null);
  const [lookPresets, setLookPresets] = useState<readonly LookPresetRecord[]>([]);
  const [rendererRuntime, setRendererRuntime] =
    useState<RendererRuntimeState>(defaultRendererRuntimeState);
  const [sceneAnalysis, setSceneAnalysis] =
    useState<SceneAnalysisSnapshot>(emptySceneAnalysis);
  const [transform, setTransformState] = useState<TransformSettings>(defaultTransformSettings);
  const [virtualOutputStatus, setVirtualOutputStatus] =
    useState<VirtualOutputStatusSnapshot>(defaultVirtualOutputSnapshot);
  const { capabilities, reportWebglFrameTime, setFboMemoryUsageBytes } = usePerformanceModeContext();
  const reportWebglFrameTimeRef = useRef(reportWebglFrameTime);
  const setFboMemoryUsageBytesRef = useRef(setFboMemoryUsageBytes);
  const virtualOutputDeliveryPolicy = useMemo(
    () => resolveVirtualOutputDeliveryPolicy(capabilities, virtualOutputStatus.clientCount),
    [capabilities, virtualOutputStatus.clientCount],
  );
  const rendererError = rendererRuntime.message;
  const webglDiagnostics = rendererRuntime.diagnostics;
  const isContextLost = rendererRuntime.isContextLost;

  useEffect(() => {
    let disposed = false;

    void getAvailableLuts()
      .then((nextLuts: readonly LutDefinition[]): void => {
        if (!disposed) {
          setAvailableLuts(nextLuts);
        }
      })
      .catch((): void => {
        if (!disposed) {
          setAvailableLuts(getBundledLuts());
        }
      });

    return (): void => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    void listLookPresets()
      .then((nextPresets: readonly LookPresetRecord[]): void => {
        if (!disposed) {
          setLookPresets(nextPresets);
        }
      })
      .catch((): void => {
        if (!disposed) {
          setLookPresets([]);
        }
      });

    return (): void => {
      disposed = true;
    };
  }, []);

  const setMode = useCallback((nextMode: RenderMode): void => {
    modeRef.current = nextMode;
    setModeState(nextMode);
  }, []);

  const setColorGrading = useCallback((nextSettings: ColorGradingSettings): void => {
    colorGradingRef.current = nextSettings;
    setColorGradingState(nextSettings);
  }, []);

  const setComparisonConfig = useCallback((nextConfig: RenderComparisonConfig): void => {
    comparisonConfigRef.current = nextConfig;
    setComparisonConfigState(nextConfig);
  }, []);

  const setMaskRefinementConfig = useCallback((nextConfig: RenderMaskRefinementConfig): void => {
    maskRefinementConfigRef.current = nextConfig;
    setMaskRefinementConfigState(nextConfig);
  }, []);

  const setPictureInPictureConfig = useCallback((nextConfig: PictureInPictureConfig): void => {
    pictureInPictureConfigRef.current = nextConfig;
    setPictureInPictureConfigState(nextConfig);
  }, []);

  const setTransform = useCallback((nextSettings: TransformSettings): void => {
    const normalizedSettings = normalizeTransformSettings(nextSettings);
    transformRef.current = normalizedSettings;
    setTransformState(normalizedSettings);
  }, []);

  const cycleRenderMode = useCallback((): void => {
    const currentIndex = renderModeOrder.indexOf(modeRef.current);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % renderModeOrder.length;
    setMode(renderModeOrder[nextIndex] ?? RenderMode.Passthrough);
  }, [setMode]);

  const setOverlayConfig = useCallback((nextConfig: OverlayConfig): void => {
    setOverlayConfigState(nextConfig);
  }, []);

  const applyCameraAssistRenderSettings = useCallback(
    (nextSettings: CameraAssistRenderSettings): void => {
      setOverlayConfig({
        showFrameGuide: nextSettings.showFrameGuide,
        showGrid: nextSettings.showGrid,
      });
    },
    [setOverlayConfig],
  );

  const bindTimelineSource = useCallback((
    sourceId: string,
    sourceElement: HTMLImageElement | HTMLVideoElement | null,
  ): void => {
    compositionAdapterRef.current.bindSource(sourceId, sourceElement);
  }, []);

  const setActiveLutId = useCallback(
    async (nextLutId: string | null): Promise<void> => {
      if (nextLutId === null) {
        lutRequestIdRef.current += 1;
        activeLutRef.current = null;
        setActiveLut(null);
        setActiveLutIdState(null);
        setLutImportError(null);
        setLutLoadError(null);
        setIsLutLoading(false);
        return;
      }

      setIsLutLoading(true);
      setLutLoadError(null);
      const requestId = lutRequestIdRef.current + 1;
      lutRequestIdRef.current = requestId;

      try {
        const loadedLut = await loadLutById(nextLutId);

        if (lutRequestIdRef.current !== requestId) {
          return;
        }

        activeLutRef.current = loadedLut;
        setActiveLut(loadedLut);
        setActiveLutIdState(nextLutId);
        setLutLoadError(null);
      } catch (lutError: unknown) {
        if (lutRequestIdRef.current !== requestId) {
          return;
        }

        activeLutRef.current = null;
        setActiveLut(null);
        setActiveLutIdState(null);
        setLutLoadError(
          lutError instanceof Error ? lutError.message : 'Failed to load the selected LUT.',
        );
      } finally {
        if (lutRequestIdRef.current === requestId) {
          setIsLutLoading(false);
        }
      }
    },
    [],
  );

  const importLutFile = useCallback(async (file: File): Promise<void> => {
    setIsLutImporting(true);
    setLutImportError(null);

    try {
      const importedDefinition = await importCustomLutFile(file);
      setAvailableLuts(await getAvailableLuts());
      await setActiveLutId(importedDefinition.id);
    } catch (error: unknown) {
      setLutImportError(
        error instanceof Error ? error.message : 'Failed to import the selected LUT.',
      );
    } finally {
      setIsLutImporting(false);
    }
  }, [setActiveLutId]);

  const deleteImportedLutById = useCallback(async (lutId: string): Promise<void> => {
    await deleteImportedLut(lutId);
    const nextLuts = await getAvailableLuts();
    setAvailableLuts(nextLuts);

    if (activeLutId === lutId) {
      await setActiveLutId(null);
    }
  }, [activeLutId, setActiveLutId]);

  const applyLookPreset = useCallback(async (presetId: string): Promise<void> => {
    const matchingPreset = lookPresets.find(
      (preset: LookPresetRecord): boolean => preset.id === presetId,
    );

    if (matchingPreset === undefined) {
      throw new Error('Unknown look preset.');
    }

    setMode(matchingPreset.settings.mode);
    setColorGrading(matchingPreset.settings.colorGrading);
    setTransform(matchingPreset.settings.transform);
    await setActiveLutId(matchingPreset.settings.activeLutId);
  }, [lookPresets, setActiveLutId, setColorGrading, setMode, setTransform]);

  const saveCurrentLookPreset = useCallback(async (name: string): Promise<void> => {
    const trimmedName = name.trim();

    if (trimmedName === '') {
      throw new Error('Preset name is required.');
    }

    setIsLookPresetSaving(true);

    try {
      const timestamp = Date.now();
      const settings: LookPresetSettings = {
        activeLutId,
        colorGrading: colorGradingRef.current,
        mode: modeRef.current,
        transform: transformRef.current,
      };
      const nextRecord: LookPresetRecord = {
        createdAt: timestamp,
        id: `look-${timestamp.toString(36)}`,
        name: trimmedName,
        settings,
        updatedAt: timestamp,
      };

      await saveLookPreset(nextRecord);
      setLookPresets(await listLookPresets());
    } finally {
      setIsLookPresetSaving(false);
    }
  }, [activeLutId]);

  const deleteLookPreset = useCallback(async (presetId: string): Promise<void> => {
    await deleteStoredLookPreset(presetId);
    setLookPresets(await listLookPresets());
  }, []);

  const resetRenderSettings = useCallback((): void => {
    setMode(RenderMode.Passthrough);
    setColorGrading(defaultColorGradingSettings);
    setComparisonConfig(defaultRenderComparisonConfig);
    setMaskRefinementConfig(defaultRenderMaskRefinementConfig);
    setPictureInPictureConfig(defaultPictureInPictureConfig);
    setTransform(defaultTransformSettings);
    lutRequestIdRef.current += 1;
    activeLutRef.current = null;
    setActiveLut(null);
    setActiveLutIdState(null);
    setLutImportError(null);
    setLutLoadError(null);
    setIsLutLoading(false);
  }, [
    setColorGrading,
    setComparisonConfig,
    setMaskRefinementConfig,
    setMode,
    setPictureInPictureConfig,
    setTransform,
  ]);

  useEffect((): void => {
    modeRef.current = mode;
  }, [mode]);

  useEffect((): void => {
    colorGradingRef.current = colorGrading;
  }, [colorGrading]);

  useEffect((): void => {
    comparisonConfigRef.current = comparisonConfig;
  }, [comparisonConfig]);

  useEffect((): void => {
    maskRefinementConfigRef.current = maskRefinementConfig;
  }, [maskRefinementConfig]);

  useEffect((): void => {
    pictureInPictureConfigRef.current = pictureInPictureConfig;
  }, [pictureInPictureConfig]);

  useEffect((): void => {
    transformRef.current = transform;
  }, [transform]);

  useEffect((): void => {
    activeLutRef.current = activeLut;
  }, [activeLut]);

  useEffect((): void => {
    performanceStateRef.current = {
      bypassHeavyPreviewPasses: capabilities.bypassHeavyPreviewPasses,
      qualityScale: capabilities.qualityScale,
    };
  }, [capabilities.bypassHeavyPreviewPasses, capabilities.qualityScale]);

  useEffect((): void => {
    reportWebglFrameTimeRef.current = reportWebglFrameTime;
  }, [reportWebglFrameTime]);

  useEffect((): void => {
    setFboMemoryUsageBytesRef.current = setFboMemoryUsageBytes;
  }, [setFboMemoryUsageBytes]);

  useEffect((): (() => void) => {
    return virtualOutputServiceRef.current.subscribeStatus(setVirtualOutputStatus);
  }, []);

  useEffect((): (() => void) => {
    const bridgeService = virtualOutputBridgeServiceRef.current;
    bridgeService.start();

    return (): void => {
      bridgeService.stop();
    };
  }, []);

  useEffect((): (() => void) | void => {
    const canvasElement = canvasRef.current;

    if (canvasElement === null) {
      return undefined;
    }

    const virtualOutputService = virtualOutputServiceRef.current;

    try {
      virtualOutputService.start({
        audioEnabled: false,
        audioStream: null,
        canvas: canvasElement,
        targetFps: virtualOutputDeliveryPolicy.targetFps,
      });
    } catch {
      return (): void => {
        virtualOutputService.stop();
      };
    }

    return (): void => {
      virtualOutputService.stop();
    };
  }, [virtualOutputDeliveryPolicy.targetFps]);

  useEffect((): void => {
    const canvasElement = canvasRef.current;

    if (canvasElement === null) {
      return;
    }

    virtualOutputServiceRef.current.setDeliveryPolicy(virtualOutputDeliveryPolicy);
  }, [virtualOutputDeliveryPolicy]);

  useEffect((): void => {
    virtualOutputServiceRef.current.setAudioStream(destinationStream);
    virtualOutputServiceRef.current.setAudioEnabled(destinationStream !== null);
  }, [destinationStream]);

  useEffect((): (() => void) => {
    function syncAIState(): void {
      const sharedState = getAIFrameState();
      aiFrameStateRef.current = sharedState;
      aiStateRef.current = {
        backgroundBlurEnabled: sharedState.enabledFeatures.backgroundBlur,
        backgroundBlurStrength: sharedState.processingConfig.backgroundBlurStrength,
        beauty: sharedState.beautyRuntime,
        faceRegions: sharedState.results?.faces[0]?.regions ?? [],
        segmentationMask: sharedState.results?.segmentationMask ?? null,
      };
    }

    syncAIState();

    return subscribeToAIFrameState(syncAIState);
  }, []);

  useEffect((): (() => void) => {
    function syncTimelinePreviewState(): void {
      const sharedState = getTimelinePreviewState();
      timelinePreviewStateRef.current = sharedState;
      compositionAdapterRef.current.setInstruction(sharedState.composition);
      setPreviewSourceMode(sharedState.mode);
      setPreviewStatus(sharedState.status);
    }

    syncTimelinePreviewState();

    return subscribeToTimelinePreviewState(syncTimelinePreviewState);
  }, []);

  useEffect((): (() => void) => {
    let animationFrameId: number | null = null;
    let isCancelled = false;
    let lastAnalysisTimestamp = 0;

    try {
      sceneAnalysisServiceRef.current = new SceneAnalysisService(
        Math.max(48, capabilities.scopeSampleWidth),
        Math.max(27, capabilities.scopeSampleHeight),
      );
    } catch {
      setSceneAnalysis(emptySceneAnalysis);

      return (): void => undefined;
    }

    const analysisIntervalMs =
      capabilities.allowScopes && !capabilities.bypassHeavyPreviewPasses ? 1400 : 2200;

    function sampleScene(timestampMs: number): void {
      if (isCancelled) {
        return;
      }

      animationFrameId = window.requestAnimationFrame(sampleScene);

      if (timestampMs - lastAnalysisTimestamp < analysisIntervalMs) {
        return;
      }

      if (document.visibilityState === 'hidden') {
        return;
      }

      const sourceCanvas = canvasRef.current;

      if (sourceCanvas === null || sourceCanvas.width === 0 || sourceCanvas.height === 0) {
        return;
      }

      lastAnalysisTimestamp = timestampMs;
      setSceneAnalysis(
        sceneAnalysisServiceRef.current?.analyzeCanvas(sourceCanvas, {
          cameraSettings: currentSettings,
          results: aiFrameStateRef.current.results,
          timestampMs,
        }) ?? emptySceneAnalysis,
      );
    }

    animationFrameId = window.requestAnimationFrame(sampleScene);

    return (): void => {
      isCancelled = true;
      sceneAnalysisServiceRef.current = null;

      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [
    capabilities.allowScopes,
    capabilities.bypassHeavyPreviewPasses,
    capabilities.scopeSampleHeight,
    capabilities.scopeSampleWidth,
    currentSettings,
  ]);

  useEffect((): (() => void) | void => {
    const canvasElement = canvasRef.current;
    const maxConsecutiveRenderRecoveryAttempts = 2;

    if (canvasElement === null) {
      return undefined;
    }

    const renderCanvasElement = canvasElement;
    let isDisposed = false;
    let consecutiveRenderFailureCount = 0;

    function cancelRenderLoop(): void {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    }

    function destroyRenderer(): void {
      rendererRef.current?.dispose();
      rendererRef.current = null;
    }

    function publishRendererRuntime(nextRuntime: RendererRuntimeState): void {
      setRendererRuntime((currentRuntime: RendererRuntimeState): RendererRuntimeState =>
        areRendererRuntimeStatesEqual(currentRuntime, nextRuntime)
          ? currentRuntime
          : nextRuntime,
      );
    }

    function syncRendererDiagnostics(nextDiagnostics: WebglDiagnostics): void {
      publishRendererRuntime(deriveRendererRuntimeStateFromDiagnostics(nextDiagnostics));
    }

    function initializeRenderer(): boolean {
      destroyRenderer();
      let nextRenderer: GLRenderer | null = null;

      try {
        nextRenderer = createRenderer(renderCanvasElement);
        nextRenderer.initialize();
        rendererRef.current = nextRenderer;
        consecutiveRenderFailureCount = 0;
        syncRendererDiagnostics(nextRenderer.getDiagnostics());
        return true;
      } catch (initializationError: unknown) {
        const failedDiagnostics =
          nextRenderer?.getDiagnostics() ?? defaultRendererRuntimeState.diagnostics;
        nextRenderer?.dispose();
        rendererRef.current = null;
        publishRendererRuntime({
          diagnostics: failedDiagnostics,
          isContextLost: false,
          message:
            initializationError instanceof Error
              ? initializationError.message
              : 'Failed to initialize the WebGL renderer.',
          reason:
            failedDiagnostics.failureReason ??
            (failedDiagnostics.backend === 'unavailable' ? 'renderer-unavailable' : null),
          status: failedDiagnostics.backend === 'canvas-2d' ? 'fallback' : 'error',
        });
        return false;
      }
    }

    function drawFrame(): void {
      if (isDisposed || contextLostRef.current) {
        return;
      }

      animationFrameRef.current = requestAnimationFrame(drawFrame);

      try {
        const previewState = timelinePreviewStateRef.current;
        const sourceVideoElement = videoRef.current;
        const performanceState = performanceStateRef.current;
        const basePerformanceState = {
          bypassHeavyPreviewPasses: performanceState.bypassHeavyPreviewPasses,
          exportMode: false,
          isPlaybackActive: previewState.mode === 'timeline' && previewState.isPlaying,
          qualityScale: performanceState.qualityScale,
        } as const;
        const adaptedRenderState: CompositionRenderState =
          previewState.mode === 'timeline'
            ? compositionAdapterRef.current.deriveRenderState(basePerformanceState)
            : {
                compositionLayerBindings: [],
                composition: null,
                passDirectives: defaultRenderPassDirectives,
                performance: basePerformanceState,
                sourceElement: null,
              };
        const renderSourceElement =
          previewState.mode === 'timeline'
            ? adaptedRenderState.composition === null
              ? adaptedRenderState.sourceElement
              : null
            : sourceVideoElement;

        if (renderSourceElement === null && adaptedRenderState.composition === null) {
          rendererRef.current?.clear();
          return;
        }

        const frameStartMs = performance.now();
        rendererRef.current?.renderFrame(renderSourceElement, {
          aiState: aiStateRef.current,
          activeLut: activeLutRef.current,
          colorGrading: colorGradingRef.current,
          compositionLayerBindings: adaptedRenderState.compositionLayerBindings,
          comparison: comparisonConfigRef.current,
          composition: adaptedRenderState.composition,
          maskRefinement: maskRefinementConfigRef.current,
          mode: modeRef.current,
          passDirectives: adaptedRenderState.passDirectives,
          performance: adaptedRenderState.performance,
          pictureInPicture: pictureInPictureConfigRef.current,
          timeSeconds: performance.now() / 1000,
          transform: transformRef.current,
        }, compositionAdapterRef.current);
        consecutiveRenderFailureCount = 0;
        syncRendererDiagnostics(rendererRef.current?.getDiagnostics() ?? defaultWebglDiagnostics);
        reportWebglFrameTimeRef.current(Math.max(0, performance.now() - frameStartMs));
        setFboMemoryUsageBytesRef.current(rendererRef.current?.getMemoryUsageBytes() ?? 0);
      } catch (renderError: unknown) {
        consecutiveRenderFailureCount += 1;

        if (
          consecutiveRenderFailureCount <= maxConsecutiveRenderRecoveryAttempts &&
          initializeRenderer()
        ) {
          return;
        }

        cancelRenderLoop();
        publishRendererRuntime({
          diagnostics: rendererRef.current?.getDiagnostics() ?? defaultWebglDiagnostics,
          isContextLost: false,
          message:
            renderError instanceof Error
              ? renderError.message
              : 'The WebGL render pipeline failed during a frame draw.',
          reason: 'render-loop-failed',
          status: 'error',
        });
      }
    }

    function startRenderLoop(): void {
      cancelRenderLoop();
      animationFrameRef.current = requestAnimationFrame(drawFrame);
    }

    function handleContextLost(event: Event): void {
      event.preventDefault();
      contextLostRef.current = true;
      const currentDiagnostics = rendererRef.current?.getDiagnostics() ?? defaultWebglDiagnostics;
      publishRendererRuntime({
        diagnostics: {
          ...currentDiagnostics,
          backend: 'unavailable',
          message: 'WebGL context lost. Waiting for restoration.',
        },
        isContextLost: true,
        message: 'WebGL context lost. Waiting for restoration.',
        reason: 'context-lost',
        status: 'context-lost',
      });
      cancelRenderLoop();
      destroyRenderer();
    }

    function handleContextRestored(): void {
      contextLostRef.current = false;

      if (initializeRenderer()) {
        startRenderLoop();
      }
    }

    renderCanvasElement.addEventListener('webglcontextlost', handleContextLost);
    renderCanvasElement.addEventListener('webglcontextrestored', handleContextRestored);

    if (initializeRenderer()) {
      startRenderLoop();
    }

    return (): void => {
      isDisposed = true;
      renderCanvasElement.removeEventListener('webglcontextlost', handleContextLost);
      renderCanvasElement.removeEventListener('webglcontextrestored', handleContextRestored);
      cancelRenderLoop();
      destroyRenderer();
    };
  }, [videoRef]);

  const contextValue = useMemo<RenderControllerContextValue>(
    (): RenderControllerContextValue => ({
      activeLutId,
      availableLuts,
      canvasRef,
      colorGrading,
      comparisonConfig,
      cycleRenderMode,
      applyLookPreset,
      applyCameraAssistRenderSettings,
      deleteImportedLut: deleteImportedLutById,
      deleteLookPreset,
      importLutFile,
      isLutLoading,
      isLutImporting,
      isContextLost,
      isLookPresetSaving,
      lutImportError,
      lutLoadError,
      lookPresets,
      maskRefinementConfig,
      mode,
      overlayConfig,
      pictureInPictureConfig,
      previewSourceMode,
      previewStatus,
      resetRenderSettings,
      rendererRuntime,
      rendererError,
      webglDiagnostics,
      saveCurrentLookPreset,
      sceneAnalysis,
      setActiveLutId,
      bindTimelineSource,
      setColorGrading,
      setComparisonConfig,
      setMaskRefinementConfig,
      setMode,
      setOverlayConfig,
      setPictureInPictureConfig,
      setTransform,
      transform,
      virtualOutputStatus,
    }),
    [
      activeLutId,
      availableLuts,
      applyCameraAssistRenderSettings,
      bindTimelineSource,
      colorGrading,
      comparisonConfig,
      cycleRenderMode,
      applyLookPreset,
      deleteImportedLutById,
      deleteLookPreset,
      importLutFile,
      isContextLost,
      isLutImporting,
      isLutLoading,
      isLookPresetSaving,
      lutImportError,
      lutLoadError,
      lookPresets,
      maskRefinementConfig,
      mode,
      overlayConfig,
      pictureInPictureConfig,
      previewSourceMode,
      previewStatus,
      resetRenderSettings,
      rendererRuntime,
      rendererError,
      webglDiagnostics,
      saveCurrentLookPreset,
      sceneAnalysis,
      setActiveLutId,
      setColorGrading,
      setComparisonConfig,
      setMaskRefinementConfig,
      setMode,
      setOverlayConfig,
      setPictureInPictureConfig,
      setTransform,
      transform,
      virtualOutputStatus,
    ],
  );

  return (
    <RenderControllerContext.Provider value={contextValue}>
      {children}
    </RenderControllerContext.Provider>
  );
}

export function useRenderController(): RenderControllerContextValue {
  const contextValue = useContext(RenderControllerContext);

  if (contextValue === null) {
    throw new Error('useRenderController must be used within a RenderController.');
  }

  return contextValue;
}
