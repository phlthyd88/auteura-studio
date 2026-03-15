import {
  startTransition,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import type { ScopeAnalysisMode } from '../engine/ScopeAnalyzer';
import { usePersistedState } from '../hooks/usePersistedState';
import { useMemoryPressure } from '../hooks/useMemoryPressure';
import { usePageVisibility } from '../hooks/usePageVisibility';
import {
  PerformanceMonitor,
  type PerformanceMonitorSnapshot,
} from '../services/PerformanceMonitor';
import {
  profileHardware,
  type HardwareTier,
  type PerformanceProfile,
} from '../services/PerformanceProfiler';

export type PerformanceMode = 'auto' | 'quality' | 'balanced' | 'performance';

export type PerformanceRecommendationAction =
  | 'clear-preview-quality-override'
  | 'disable-forced-background-blur'
  | 'disable-forced-scopes'
  | 'set-mode-balanced'
  | 'set-mode-performance'
  | 'set-mode-quality'
  | 'set-preview-quality-half'
  | 'set-preview-quality-three-quarters';

export interface PerformanceRecommendation {
  readonly action: PerformanceRecommendationAction;
  readonly description: string;
  readonly id: string;
  readonly label: string;
  readonly severity: 'info' | 'warning';
}

export interface PerformanceCapabilities {
  readonly aiFrameRateCap: number;
  readonly allowBackgroundBlur: boolean;
  readonly allowScopes: boolean;
  readonly bypassHeavyPreviewPasses: boolean;
  readonly qualityScale: number;
  readonly scopeAnalysisMode: ScopeAnalysisMode;
  readonly scopeFrameRateCap: number;
  readonly scopeSampleHeight: number;
  readonly scopeSampleWidth: number;
  readonly virtualOutputFrameRateCap: number;
  readonly virtualOutputProfile: 'balanced' | 'full' | 'safe';
}

export interface PerformanceDiagnostics {
  readonly activeDegradationStage: 0 | 1 | 2 | 3;
  readonly averageFps: number;
  readonly averageFrameTimeMs: number;
  readonly deviceClass: 'high' | 'low' | 'mid';
  readonly degradationReason: string | null;
  readonly fboMemoryUsageBytes: number;
  readonly forceBackgroundBlurPreview: boolean;
  readonly forceScopesPreview: boolean;
  readonly gpuBenchmarkMs: number | null;
  readonly hardwareTier: HardwareTier;
  readonly heapUsageRatio: number | null;
  readonly isMemoryConstrained: boolean;
  readonly isPageHidden: boolean;
  readonly isProfiling: boolean;
  readonly longFrameRatio: number;
  readonly profilerHardwareConcurrency: number | null;
  readonly recommendations: readonly PerformanceRecommendation[];
  readonly recommendedMode: Exclude<PerformanceMode, 'auto'>;
  readonly scopeStatusReason: string | null;
  readonly webglRenderTimeMs: number;
}

export interface PerformanceModeContextValue {
  readonly capabilities: PerformanceCapabilities;
  readonly diagnostics: PerformanceDiagnostics;
  readonly effectiveMode: Exclude<PerformanceMode, 'auto'>;
  readonly forceBackgroundBlurPreview: boolean;
  readonly forceScopesPreview: boolean;
  readonly mode: PerformanceMode;
  readonly previewQualityOverride: number | null;
  applyRecommendation: (action: PerformanceRecommendationAction) => void;
  reportWebglFrameTime: (durationMs: number) => void;
  setFboMemoryUsageBytes: (nextBytes: number) => void;
  setForceBackgroundBlurPreview: (nextEnabled: boolean) => void;
  setForceScopesPreview: (nextEnabled: boolean) => void;
  setMode: (nextMode: PerformanceMode) => void;
  setPreviewQualityOverride: (nextScale: number | null) => void;
}

const PerformanceModeContext = createContext<PerformanceModeContextValue | null>(null);

function getDeviceClass(): PerformanceDiagnostics['deviceClass'] {
  const deviceMemory =
    typeof navigator !== 'undefined' && 'deviceMemory' in navigator
      ? navigator.deviceMemory
      : undefined;
  const hardwareConcurrency =
    typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number'
      ? navigator.hardwareConcurrency
      : 4;

  if (
    (typeof deviceMemory === 'number' && deviceMemory <= 4) ||
    hardwareConcurrency <= 4
  ) {
    return 'low';
  }

  if (
    (typeof deviceMemory === 'number' && deviceMemory >= 8) ||
    hardwareConcurrency >= 8
  ) {
    return 'high';
  }

  return 'mid';
}

function getBaseQualityScale(hardwareTier: HardwareTier): number {
  if (hardwareTier === 'LOW') {
    return 0.5;
  }

  if (hardwareTier === 'MEDIUM') {
    return 0.75;
  }

  return 1;
}

function evaluateAdaptiveDegradation(
  monitorSnapshot: PerformanceMonitorSnapshot,
  webglRenderTimeMs: number,
  isMemoryConstrained: boolean,
  isPageHidden: boolean,
): {
  readonly recommendedStage: 0 | 1 | 2 | 3;
  readonly reason: string | null;
} {
  if (isPageHidden) {
    return {
      recommendedStage: 3,
      reason: 'Tab hidden',
    };
  }

  if (isMemoryConstrained) {
    return {
      recommendedStage: 3,
      reason: 'Memory pressure',
    };
  }

  if (
    (monitorSnapshot.averageFps > 0 && monitorSnapshot.averageFps < 42) ||
    webglRenderTimeMs >= 24 ||
    monitorSnapshot.longFrameRatio >= 0.28
  ) {
    return {
      recommendedStage: 3,
      reason: 'Critical frame-time overload',
    };
  }

  if (
    (monitorSnapshot.averageFps > 0 && monitorSnapshot.averageFps < 50) ||
    webglRenderTimeMs >= 18 ||
    monitorSnapshot.longFrameRatio >= 0.18
  ) {
    return {
      recommendedStage: 2,
      reason: 'Sustained preview overload',
    };
  }

  if (
    (monitorSnapshot.averageFps > 0 && monitorSnapshot.averageFps < 57) ||
    webglRenderTimeMs >= 14 ||
    monitorSnapshot.longFrameRatio >= 0.1
  ) {
    return {
      recommendedStage: 1,
      reason: 'Mild frame pacing instability',
    };
  }

  return {
    recommendedStage: 0,
    reason: null,
  };
}

function getRecommendedMode(
  deviceClass: PerformanceDiagnostics['deviceClass'],
  hardwareTier: HardwareTier,
  monitorSnapshot: PerformanceMonitorSnapshot,
  isMemoryConstrained: boolean,
  isPageHidden: boolean,
): Exclude<PerformanceMode, 'auto'> {
  if (isPageHidden || isMemoryConstrained) {
    return 'performance';
  }

  if (
    hardwareTier === 'LOW' ||
    deviceClass === 'low' ||
    (monitorSnapshot.averageFps > 0 && monitorSnapshot.averageFps < 45)
  ) {
    return 'performance';
  }

  if (
    hardwareTier === 'MEDIUM' ||
    deviceClass === 'mid' ||
    (monitorSnapshot.averageFps > 0 && monitorSnapshot.averageFps < 58) ||
    monitorSnapshot.longFrameRatio > 0.12
  ) {
    return 'balanced';
  }

  return 'quality';
}

function getCapabilities(
  effectiveMode: Exclude<PerformanceMode, 'auto'>,
  hardwareTier: HardwareTier,
  previewQualityOverride: number | null,
  forceBackgroundBlurPreview: boolean,
  forceScopesPreview: boolean,
  activeDegradationStage: 0 | 1 | 2 | 3,
  isMemoryConstrained: boolean,
  isPageHidden: boolean,
): PerformanceCapabilities {
  const baseQualityScale = getBaseQualityScale(hardwareTier);
  const baseCapabilities: Record<Exclude<PerformanceMode, 'auto'>, PerformanceCapabilities> = {
    balanced: {
      aiFrameRateCap: 18,
      allowBackgroundBlur: hardwareTier !== 'LOW',
      allowScopes: true,
      bypassHeavyPreviewPasses: hardwareTier !== 'HIGH',
      qualityScale: Math.min(1, baseQualityScale + 0.1),
      scopeAnalysisMode: 'cpu-sampled',
      scopeFrameRateCap: 6,
      scopeSampleHeight: 42,
      scopeSampleWidth: 72,
      virtualOutputFrameRateCap:
        hardwareTier === 'HIGH' ? 30 : hardwareTier === 'MEDIUM' ? 24 : 20,
      virtualOutputProfile: hardwareTier === 'LOW' ? 'safe' : 'balanced',
    },
    performance: {
      aiFrameRateCap: 10,
      allowBackgroundBlur: hardwareTier !== 'LOW',
      allowScopes: hardwareTier === 'HIGH',
      bypassHeavyPreviewPasses: true,
      qualityScale: baseQualityScale,
      scopeAnalysisMode: hardwareTier === 'HIGH' ? 'cpu-sampled' : 'disabled',
      scopeFrameRateCap: hardwareTier === 'HIGH' ? 4 : 0,
      scopeSampleHeight: 27,
      scopeSampleWidth: 48,
      virtualOutputFrameRateCap:
        hardwareTier === 'HIGH' ? 24 : hardwareTier === 'MEDIUM' ? 20 : 15,
      virtualOutputProfile: 'safe',
    },
    quality: {
      aiFrameRateCap: 24,
      allowBackgroundBlur: true,
      allowScopes: true,
      bypassHeavyPreviewPasses: false,
      qualityScale: 1,
      scopeAnalysisMode: 'cpu-sampled',
      scopeFrameRateCap: 8,
      scopeSampleHeight: 54,
      scopeSampleWidth: 96,
      virtualOutputFrameRateCap: 30,
      virtualOutputProfile: 'full',
    },
  };
  const selectedCapabilities = baseCapabilities[effectiveMode];
  const qualityScale =
    previewQualityOverride === null
      ? selectedCapabilities.qualityScale
      : Math.max(0.5, Math.min(1, previewQualityOverride));
  const canForceScopes = forceScopesPreview && !isMemoryConstrained && !isPageHidden;

  if (isMemoryConstrained || isPageHidden) {
    return {
      ...selectedCapabilities,
      aiFrameRateCap: Math.min(selectedCapabilities.aiFrameRateCap, 10),
      allowBackgroundBlur: false,
      allowScopes: false,
      bypassHeavyPreviewPasses: true,
      qualityScale: Math.min(qualityScale, 0.5),
      scopeAnalysisMode: 'disabled',
      scopeFrameRateCap: 0,
      scopeSampleHeight: 27,
      scopeSampleWidth: 48,
      virtualOutputFrameRateCap: 12,
      virtualOutputProfile: 'safe',
    };
  }

  if (activeDegradationStage >= 3) {
    return {
      ...selectedCapabilities,
      aiFrameRateCap: Math.min(selectedCapabilities.aiFrameRateCap, forceBackgroundBlurPreview ? 6 : 8),
      allowBackgroundBlur: forceBackgroundBlurPreview,
      allowScopes: canForceScopes,
      bypassHeavyPreviewPasses: true,
      qualityScale:
        previewQualityOverride === null ? Math.min(qualityScale, 0.5) : qualityScale,
      scopeAnalysisMode: canForceScopes ? 'cpu-sampled' : 'disabled',
      scopeFrameRateCap: canForceScopes ? 2 : 0,
      scopeSampleHeight: 27,
      scopeSampleWidth: 48,
      virtualOutputFrameRateCap: Math.min(selectedCapabilities.virtualOutputFrameRateCap, 15),
      virtualOutputProfile: 'safe',
    };
  }

  if (activeDegradationStage === 2) {
    return {
      ...selectedCapabilities,
      aiFrameRateCap: Math.min(selectedCapabilities.aiFrameRateCap, 12),
      allowScopes: canForceScopes,
      bypassHeavyPreviewPasses: true,
      qualityScale:
        previewQualityOverride === null ? Math.min(qualityScale, 0.75) : qualityScale,
      scopeAnalysisMode: canForceScopes ? 'cpu-sampled' : 'disabled',
      scopeFrameRateCap: canForceScopes ? 3 : 0,
      scopeSampleHeight: 27,
      scopeSampleWidth: 48,
      virtualOutputFrameRateCap: Math.min(selectedCapabilities.virtualOutputFrameRateCap, 20),
      virtualOutputProfile:
        selectedCapabilities.virtualOutputProfile === 'full' ? 'balanced' : 'safe',
    };
  }

  if (activeDegradationStage === 1) {
    return {
      ...selectedCapabilities,
      aiFrameRateCap: Math.min(selectedCapabilities.aiFrameRateCap, 16),
      allowScopes: canForceScopes,
      scopeAnalysisMode: canForceScopes ? 'cpu-sampled' : 'disabled',
      scopeFrameRateCap: canForceScopes ? 4 : 0,
      scopeSampleHeight: 36,
      scopeSampleWidth: 64,
      virtualOutputFrameRateCap: Math.min(selectedCapabilities.virtualOutputFrameRateCap, 24),
      virtualOutputProfile:
        selectedCapabilities.virtualOutputProfile === 'full' ? 'balanced' : selectedCapabilities.virtualOutputProfile,
    };
  }

  return {
    ...selectedCapabilities,
    allowBackgroundBlur:
      selectedCapabilities.allowBackgroundBlur || forceBackgroundBlurPreview,
    qualityScale,
  };
}

function buildRecommendations(
  input: {
    readonly activeDegradationStage: 0 | 1 | 2 | 3;
    readonly averageFps: number;
    readonly effectiveMode: Exclude<PerformanceMode, 'auto'>;
    readonly forceBackgroundBlurPreview: boolean;
    readonly forceScopesPreview: boolean;
    readonly previewQualityOverride: number | null;
    readonly recommendedMode: Exclude<PerformanceMode, 'auto'>;
  },
): readonly PerformanceRecommendation[] {
  const recommendations: PerformanceRecommendation[] = [];

  if (input.effectiveMode !== input.recommendedMode) {
    const actionMap: Record<Exclude<PerformanceMode, 'auto'>, PerformanceRecommendationAction> = {
      balanced: 'set-mode-balanced',
      performance: 'set-mode-performance',
      quality: 'set-mode-quality',
    };

    recommendations.push({
      action: actionMap[input.recommendedMode],
      description: `Current runtime conditions suggest switching to ${input.recommendedMode} mode.`,
      id: `recommended-mode-${input.recommendedMode}`,
      label: `Use ${input.recommendedMode} mode`,
      severity: input.activeDegradationStage >= 2 ? 'warning' : 'info',
    });
  }

  if (input.forceBackgroundBlurPreview && (input.activeDegradationStage >= 1 || input.averageFps < 58)) {
    recommendations.push({
      action: 'disable-forced-background-blur',
      description: 'Forced preview blur is increasing render pressure. Let guardrails manage it automatically.',
      id: 'disable-forced-background-blur',
      label: 'Disable forced blur',
      severity: 'warning',
    });
  }

  if (input.forceScopesPreview && (input.activeDegradationStage >= 2 || input.averageFps < 54)) {
    recommendations.push({
      action: 'disable-forced-scopes',
      description: 'Forced scopes are increasing preview load. Let guardrails pause them until frame pacing recovers.',
      id: 'disable-forced-scopes',
      label: 'Disable forced scopes',
      severity: 'warning',
    });
  }

  if (input.activeDegradationStage >= 3 && (input.previewQualityOverride === null || input.previewQualityOverride > 0.5)) {
    recommendations.push({
      action: 'set-preview-quality-half',
      description: 'Dropping preview scale to 50% should stabilize playback on the current device.',
      id: 'set-preview-quality-half',
      label: 'Use 50% preview quality',
      severity: 'warning',
    });
  } else if (
    input.activeDegradationStage >= 2 &&
    (input.previewQualityOverride === null || input.previewQualityOverride > 0.75)
  ) {
    recommendations.push({
      action: 'set-preview-quality-three-quarters',
      description: 'A 75% internal preview scale should ease fill-rate and AI pressure without overly softening the image.',
      id: 'set-preview-quality-three-quarters',
      label: 'Use 75% preview quality',
      severity: 'info',
    });
  }

  if (
    input.activeDegradationStage === 0 &&
    input.averageFps >= 59 &&
    input.previewQualityOverride !== null &&
    input.previewQualityOverride < 1
  ) {
    recommendations.push({
      action: 'clear-preview-quality-override',
      description: 'The system is stable again. Restore automatic preview scaling to recover full quality.',
      id: 'clear-preview-quality-override',
      label: 'Restore automatic quality',
      severity: 'info',
    });
  }

  return recommendations;
}

export function PerformanceModeProvider({ children }: PropsWithChildren): JSX.Element {
  const deviceClass = useMemo<PerformanceDiagnostics['deviceClass']>(() => getDeviceClass(), []);
  const isPageHidden = usePageVisibility();
  const { heapUsageRatio, isMemoryConstrained } = useMemoryPressure();
  const performanceMonitorRef = useRef<PerformanceMonitor>(new PerformanceMonitor());
  const diagnosticsSnapshotRef = useRef<PerformanceMonitorSnapshot>(
    performanceMonitorRef.current.getSnapshot(),
  );
  const degradationCountersRef = useRef<{
    degradeSamples: number;
    recoverSamples: number;
  }>({
    degradeSamples: 0,
    recoverSamples: 0,
  });
  const webglRenderTimeRef = useRef<number>(0);
  const fboMemoryUsageBytesRef = useRef<number>(0);
  const [mode, setMode] = useState<PerformanceMode>('balanced');
  const [forceBackgroundBlurPreview, setForceBackgroundBlurPreview] =
    usePersistedState<boolean>('auteura:force-background-blur-preview', false);
  const [forceScopesPreview, setForceScopesPreview] = usePersistedState<boolean>(
    'auteura:force-scopes-preview',
    false,
  );
  const [previewQualityOverride, setPreviewQualityOverride] = usePersistedState<number | null>(
    'auteura:preview-quality-override',
    null,
  );
  const [storedProfile, setStoredProfile] = usePersistedState<PerformanceProfile | null>(
    'auteura:performance-profile',
    null,
  );
  const [isProfiling, setIsProfiling] = useState<boolean>(storedProfile === null);
  const [activeDegradationStage, setActiveDegradationStage] = useState<0 | 1 | 2 | 3>(0);
  const [degradationReason, setDegradationReason] = useState<string | null>(null);
  const [fboMemoryUsageBytes, setFboMemoryUsageBytesState] = useState<number>(0);
  const [monitorSnapshot, setMonitorSnapshot] = useState<PerformanceMonitorSnapshot>(
    performanceMonitorRef.current.getSnapshot(),
  );
  const [webglRenderTimeMs, setWebglRenderTimeMs] = useState<number>(0);

  useEffect((): (() => void) => {
    let isCancelled = false;

    void profileHardware()
      .then((profile): void => {
        if (isCancelled) {
          return;
        }

        setStoredProfile(profile);
        setIsProfiling(false);
      })
      .catch((): void => {
        if (isCancelled) {
          return;
        }

        setIsProfiling(false);
      });

    return (): void => {
      isCancelled = true;
    };
  }, [setStoredProfile]);

  useEffect((): (() => void) => {
    if (isPageHidden) {
      const resetSnapshot = performanceMonitorRef.current.reset();
      diagnosticsSnapshotRef.current = resetSnapshot;
      setMonitorSnapshot(resetSnapshot);
      return (): void => undefined;
    }

    let animationFrameId: number | null = null;
    let isCancelled = false;

    function sample(timestampMs: number): void {
      if (isCancelled) {
        return;
      }

      diagnosticsSnapshotRef.current = performanceMonitorRef.current.recordFrame(timestampMs);
      animationFrameId = window.requestAnimationFrame(sample);
    }

    animationFrameId = window.requestAnimationFrame(sample);

    return (): void => {
      isCancelled = true;

      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isPageHidden]);

  useEffect((): (() => void) => {
    const intervalId = window.setInterval((): void => {
      const evaluation = evaluateAdaptiveDegradation(
        diagnosticsSnapshotRef.current,
        webglRenderTimeRef.current,
        isMemoryConstrained,
        isPageHidden,
      );
      const counters = degradationCountersRef.current;

      setActiveDegradationStage((currentStage: 0 | 1 | 2 | 3): 0 | 1 | 2 | 3 => {
        if (evaluation.recommendedStage > currentStage) {
          counters.degradeSamples += 1;
          counters.recoverSamples = 0;

          if (counters.degradeSamples >= 2) {
            counters.degradeSamples = 0;
            return Math.min(3, currentStage + 1) as 0 | 1 | 2 | 3;
          }

          return currentStage;
        }

        if (evaluation.recommendedStage < currentStage) {
          counters.recoverSamples += 1;
          counters.degradeSamples = 0;

          if (counters.recoverSamples >= 4) {
            counters.recoverSamples = 0;
            return Math.max(evaluation.recommendedStage, currentStage - 1) as 0 | 1 | 2 | 3;
          }

          return currentStage;
        }

        counters.degradeSamples = 0;
        counters.recoverSamples = 0;
        return currentStage;
      });
      setDegradationReason(evaluation.reason);
    }, 1000);

    return (): void => {
      window.clearInterval(intervalId);
    };
  }, [isMemoryConstrained, isPageHidden]);

  useEffect((): (() => void) => {
    const intervalId = window.setInterval((): void => {
      startTransition((): void => {
        setMonitorSnapshot(diagnosticsSnapshotRef.current);
        setWebglRenderTimeMs(webglRenderTimeRef.current);
        setFboMemoryUsageBytesState(fboMemoryUsageBytesRef.current);
      });
    }, 500);

    return (): void => {
      window.clearInterval(intervalId);
    };
  }, []);

  const hardwareTier = storedProfile?.tier ?? 'MEDIUM';
  const recommendedMode = useMemo<Exclude<PerformanceMode, 'auto'>>(
    (): Exclude<PerformanceMode, 'auto'> =>
      getRecommendedMode(
        deviceClass,
        hardwareTier,
        monitorSnapshot,
        isMemoryConstrained,
        isPageHidden,
      ),
    [
      deviceClass,
      hardwareTier,
      isMemoryConstrained,
      isPageHidden,
      monitorSnapshot,
    ],
  );
  const effectiveMode = mode === 'auto' ? recommendedMode : mode;
  const capabilities = useMemo<PerformanceCapabilities>(
    (): PerformanceCapabilities =>
      getCapabilities(
        effectiveMode,
        hardwareTier,
        previewQualityOverride,
        forceBackgroundBlurPreview,
        forceScopesPreview,
        activeDegradationStage,
        isMemoryConstrained,
        isPageHidden,
      ),
    [
      activeDegradationStage,
      effectiveMode,
      forceBackgroundBlurPreview,
      forceScopesPreview,
      hardwareTier,
      previewQualityOverride,
      isMemoryConstrained,
      isPageHidden,
    ],
  );
  const recommendations = useMemo<readonly PerformanceRecommendation[]>(
    (): readonly PerformanceRecommendation[] =>
      buildRecommendations({
        activeDegradationStage,
        averageFps: monitorSnapshot.averageFps,
        effectiveMode,
        forceBackgroundBlurPreview,
        forceScopesPreview,
        previewQualityOverride,
        recommendedMode,
      }),
    [
      activeDegradationStage,
      effectiveMode,
      forceBackgroundBlurPreview,
      forceScopesPreview,
      monitorSnapshot.averageFps,
      previewQualityOverride,
      recommendedMode,
    ],
  );

  const reportWebglFrameTime = useCallback((durationMs: number): void => {
    webglRenderTimeRef.current = durationMs;
  }, []);

  const setFboMemoryUsageBytes = useCallback((nextBytes: number): void => {
    fboMemoryUsageBytesRef.current = nextBytes;
  }, []);

  const applyRecommendation = useCallback((action: PerformanceRecommendationAction): void => {
    if (action === 'disable-forced-background-blur') {
      setForceBackgroundBlurPreview(false);
      return;
    }

    if (action === 'disable-forced-scopes') {
      setForceScopesPreview(false);
      return;
    }

    if (action === 'set-preview-quality-half') {
      setPreviewQualityOverride(0.5);
      return;
    }

    if (action === 'set-preview-quality-three-quarters') {
      setPreviewQualityOverride(0.75);
      return;
    }

    if (action === 'clear-preview-quality-override') {
      setPreviewQualityOverride(null);
      return;
    }

    if (action === 'set-mode-balanced') {
      setMode('balanced');
      return;
    }

    if (action === 'set-mode-performance') {
      setMode('performance');
      return;
    }

    setMode('quality');
  }, [setForceBackgroundBlurPreview, setForceScopesPreview, setPreviewQualityOverride]);

  const scopeStatusReason = useMemo<string | null>(() => {
    if (isPageHidden) {
      return 'Scopes pause while the tab is hidden.';
    }

    if (isMemoryConstrained) {
      return 'Scopes pause under memory pressure.';
    }

    if (capabilities.allowScopes) {
      return forceScopesPreview && activeDegradationStage >= 1
        ? `Scopes are forced on while guardrail stage ${activeDegradationStage} is active.`
        : null;
    }

    if (activeDegradationStage >= 1) {
      return `Guardrail stage ${activeDegradationStage} paused scopes to protect preview fluidity.`;
    }

    return 'Scopes are disabled by the current performance profile.';
  }, [
    activeDegradationStage,
    capabilities.allowScopes,
    forceScopesPreview,
    isMemoryConstrained,
    isPageHidden,
  ]);

  const contextValue = useMemo<PerformanceModeContextValue>(
    (): PerformanceModeContextValue => ({
      applyRecommendation,
      capabilities,
      diagnostics: {
        activeDegradationStage,
        averageFps: monitorSnapshot.averageFps,
        averageFrameTimeMs: monitorSnapshot.averageFrameTimeMs,
        deviceClass,
        degradationReason,
        fboMemoryUsageBytes,
        forceBackgroundBlurPreview,
        forceScopesPreview,
        gpuBenchmarkMs: storedProfile?.gpuBenchmarkMs ?? null,
        hardwareTier,
        heapUsageRatio,
        isMemoryConstrained,
        isPageHidden,
        isProfiling,
        longFrameRatio: monitorSnapshot.longFrameRatio,
        profilerHardwareConcurrency: storedProfile?.hardwareConcurrency ?? null,
        recommendations,
        recommendedMode,
        scopeStatusReason,
        webglRenderTimeMs,
      },
      effectiveMode,
      forceBackgroundBlurPreview,
      forceScopesPreview,
      mode,
      previewQualityOverride,
      reportWebglFrameTime,
      setFboMemoryUsageBytes,
      setForceBackgroundBlurPreview,
      setForceScopesPreview,
      setMode,
      setPreviewQualityOverride,
    }),
    [
      applyRecommendation,
      capabilities,
      activeDegradationStage,
      degradationReason,
      deviceClass,
      effectiveMode,
      fboMemoryUsageBytes,
      forceBackgroundBlurPreview,
      forceScopesPreview,
      hardwareTier,
      heapUsageRatio,
      isMemoryConstrained,
      isPageHidden,
      isProfiling,
      mode,
      monitorSnapshot.averageFps,
      monitorSnapshot.averageFrameTimeMs,
      monitorSnapshot.longFrameRatio,
      previewQualityOverride,
      reportWebglFrameTime,
      recommendations,
      recommendedMode,
      scopeStatusReason,
      setFboMemoryUsageBytes,
      setForceBackgroundBlurPreview,
      setForceScopesPreview,
      setPreviewQualityOverride,
      storedProfile?.gpuBenchmarkMs,
      storedProfile?.hardwareConcurrency,
      webglRenderTimeMs,
    ],
  );

  return (
    <PerformanceModeContext.Provider value={contextValue}>
      {children}
    </PerformanceModeContext.Provider>
  );
}

export function usePerformanceModeContext(): PerformanceModeContextValue {
  const contextValue = useContext(PerformanceModeContext);

  if (contextValue === null) {
    throw new Error('usePerformanceModeContext must be used within a PerformanceModeProvider.');
  }

  return contextValue;
}
