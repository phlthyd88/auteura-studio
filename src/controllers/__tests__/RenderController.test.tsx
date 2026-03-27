// @vitest-environment jsdom

import { render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RenderController, useRenderController } from '../RenderController';
import type { GLRendererDiagnostics } from '../../engine/GLRenderer';

interface RenderSnapshot {
  readonly backend: GLRendererDiagnostics['backend'];
  readonly diagnosticsMessage: string | null;
  readonly diagnosticsReason: string | null;
  readonly isContextLost: boolean;
  readonly previewSourceMode: string;
  readonly previewStatus: string;
  readonly rendererError: string | null;
  readonly runtimeMessage: string | null;
  readonly runtimeReason: string | null;
  readonly runtimeStatus: string;
}

const mockedState = vi.hoisted(() => ({
  createRendererError: null as Error | null,
  diagnostics: {
    apiExposed: true,
    backend: 'webgl',
    experimentalContextAvailable: true,
    failureReason: null,
    message: null,
    webglContextAvailable: true,
  } as GLRendererDiagnostics,
  initializeError: null as Error | null,
  memoryUsageBytes: 0,
  rendererInstances: [] as Array<{
    readonly clear: ReturnType<typeof vi.fn>;
    readonly dispose: ReturnType<typeof vi.fn>;
    readonly initialize: ReturnType<typeof vi.fn>;
    readonly renderFrame: ReturnType<typeof vi.fn>;
  }>,
  reportWebglFrameTime: vi.fn(),
  setFboMemoryUsageBytes: vi.fn(),
}));

function createDiagnostics(
  overrides: Partial<GLRendererDiagnostics> = {},
): GLRendererDiagnostics {
  return {
    apiExposed: true,
    backend: 'webgl',
    experimentalContextAvailable: true,
    failureReason: null,
    message: null,
    webglContextAvailable: true,
    ...overrides,
  };
}

vi.mock('../CameraController', () => ({
  useCameraController: (): {
    readonly currentSettings: null;
    readonly videoRef: { readonly current: null };
  } => ({
    currentSettings: null,
    videoRef: { current: null },
  }),
}));

vi.mock('../../context/AudioContext', () => ({
  useAudioContext: (): {
    readonly destinationStream: null;
  } => ({
    destinationStream: null,
  }),
}));

vi.mock('../../providers/PerformanceModeProvider', () => ({
  usePerformanceModeContext: (): {
    readonly capabilities: {
      readonly aiFrameRateCap: number;
      readonly allowBackgroundBlur: boolean;
      readonly allowScopes: boolean;
      readonly bypassHeavyPreviewPasses: boolean;
      readonly qualityScale: number;
      readonly scopeAnalysisMode: 'cpu-sampled';
      readonly scopeFrameRateCap: number;
      readonly scopeSampleHeight: number;
      readonly scopeSampleWidth: number;
      readonly virtualOutputFrameRateCap: number;
      readonly virtualOutputProfile: 'safe';
    };
    readonly reportWebglFrameTime: typeof mockedState.reportWebglFrameTime;
    readonly setFboMemoryUsageBytes: typeof mockedState.setFboMemoryUsageBytes;
  } => ({
    capabilities: {
      aiFrameRateCap: 18,
      allowBackgroundBlur: true,
      allowScopes: false,
      bypassHeavyPreviewPasses: true,
      qualityScale: 1,
      scopeAnalysisMode: 'cpu-sampled',
      scopeFrameRateCap: 6,
      scopeSampleHeight: 27,
      scopeSampleWidth: 48,
      virtualOutputFrameRateCap: 15,
      virtualOutputProfile: 'safe',
    },
    reportWebglFrameTime: mockedState.reportWebglFrameTime,
    setFboMemoryUsageBytes: mockedState.setFboMemoryUsageBytes,
  }),
}));

vi.mock('../../services/LutService', () => ({
  deleteImportedLut: vi.fn((): Promise<void> => Promise.resolve()),
  getAvailableLuts: vi.fn((): Promise<readonly []> => Promise.resolve([])),
  getBundledLuts: vi.fn((): readonly [] => []),
  importLutFile: vi.fn((): Promise<{ readonly id: string }> => Promise.resolve({ id: 'lut-1' })),
  loadLutById: vi.fn((): Promise<never> => Promise.reject(new Error('Unexpected LUT load.'))),
}));

vi.mock('../../services/LookPresetStorageService', () => ({
  deleteLookPreset: vi.fn((): Promise<void> => Promise.resolve()),
  listLookPresets: vi.fn((): Promise<readonly []> => Promise.resolve([])),
  saveLookPreset: vi.fn((): Promise<void> => Promise.resolve()),
}));

vi.mock('../../services/AIVisionStateStore', () => ({
  getAIFrameState: (): {
    readonly beautyRuntime: {
      readonly active: boolean;
      readonly appliedAt: null;
      readonly bypassed: boolean;
      readonly degraded: boolean;
      readonly lastFaceCount: number;
      readonly smoothingFactor: number;
    };
    readonly beautySettings: {
      readonly complexionBalancing: number;
      readonly detailPreservation: number;
      readonly enabled: boolean;
      readonly previewBypassUnderLoad: boolean;
      readonly skinSmoothing: number;
      readonly underEyeSoftening: number;
    };
    readonly enabledFeatures: {
      readonly backgroundBlur: boolean;
      readonly faceTracking: boolean;
    };
    readonly processingConfig: {
      readonly backgroundBlurStrength: number;
      readonly frameSampleSize: number;
      readonly maxInferenceFps: number;
      readonly pauseWhenHidden: boolean;
    };
    readonly results: null;
  } => ({
    beautyRuntime: {
      active: false,
      appliedAt: null,
      bypassed: false,
      degraded: false,
      lastFaceCount: 0,
      smoothingFactor: 0,
    },
    beautySettings: {
      complexionBalancing: 0,
      detailPreservation: 0.75,
      enabled: false,
      previewBypassUnderLoad: false,
      skinSmoothing: 0,
      underEyeSoftening: 0,
    },
    enabledFeatures: {
      backgroundBlur: false,
      faceTracking: false,
    },
    processingConfig: {
      backgroundBlurStrength: 0.65,
      frameSampleSize: 384,
      maxInferenceFps: 18,
      pauseWhenHidden: true,
    },
    results: null,
  }),
  subscribeToAIFrameState: () => (): void => undefined,
}));

vi.mock('../../services/TimelinePreviewStore', () => ({
  getTimelinePreviewState: (): {
    readonly activeClipId: null;
    readonly activeSources: Record<string, never>;
    readonly clipOffsetMs: number;
    readonly composition: null;
    readonly isPlaying: boolean;
    readonly mode: 'live';
    readonly status: 'idle';
  } => ({
    activeClipId: null,
    activeSources: {},
    clipOffsetMs: 0,
    composition: null,
    isPlaying: false,
    mode: 'live',
    status: 'idle',
  }),
  subscribeToTimelinePreviewState: () => (): void => undefined,
}));

vi.mock('../../services/SceneAnalysisService', () => ({
  SceneAnalysisService: class MockSceneAnalysisService {
    analyzeCanvas(): {
      readonly insights: readonly [];
      readonly scope: {
        readonly histogram: readonly [];
        readonly rgbParade: {
          readonly blue: readonly [];
          readonly green: readonly [];
          readonly red: readonly [];
        };
        readonly vectorscope: readonly [];
        readonly waveform: readonly [];
      };
      readonly stats: null;
      readonly status: 'idle';
      readonly timestamp: null;
    } {
      return {
        insights: [],
        scope: {
          histogram: [],
          rgbParade: {
            blue: [],
            green: [],
            red: [],
          },
          vectorscope: [],
          waveform: [],
        },
        stats: null,
        status: 'idle',
        timestamp: null,
      };
    }
  },
  emptySceneAnalysis: {
    insights: [],
    scope: {
      histogram: [],
      rgbParade: {
        blue: [],
        green: [],
        red: [],
      },
      vectorscope: [],
      waveform: [],
    },
    stats: null,
    status: 'idle',
    timestamp: null,
  },
}));

vi.mock('../../services/AuteuraVirtualOutputService', () => {
  const defaultSnapshot = {
    bridgeState: 'unavailable',
    clientCount: 0,
    deliveryProfile: 'safe',
    extensionDetected: false,
    hasAudio: false,
    hasVideo: false,
    hostRegistered: false,
    lastBridgeEvent: null,
    lastError: null,
    lastHeartbeatAt: null,
    leasedStreamCount: 0,
    state: 'idle',
    targetFps: 0,
  } as const;

  return {
    AuteuraVirtualOutputService: class MockAuteuraVirtualOutputService {
      subscribeStatus(
        listener: (snapshot: typeof defaultSnapshot) => void,
      ): () => void {
        listener(defaultSnapshot);
        return (): void => undefined;
      }

      start(): MediaStream {
        return {} as MediaStream;
      }

      stop(): void {
        return undefined;
      }

      setAudioEnabled(): void {
        return undefined;
      }

      setAudioStream(): void {
        return undefined;
      }

      setDeliveryPolicy(): void {
        return undefined;
      }
    },
    defaultVirtualOutputSnapshot: defaultSnapshot,
    resolveVirtualOutputDeliveryPolicy: (): {
      readonly profile: 'safe';
      readonly targetFps: number;
    } => ({
      profile: 'safe',
      targetFps: 15,
    }),
  };
});

vi.mock('../../services/AuteuraVirtualOutputBridgeService', () => ({
  AuteuraVirtualOutputBridgeService: class MockAuteuraVirtualOutputBridgeService {
    start(): void {
      return undefined;
    }

    stop(): void {
      return undefined;
    }
  },
}));

vi.mock('../../engine/createStudioRenderer', () => ({
  createStudioRenderer: (): {
    readonly clear: ReturnType<typeof vi.fn>;
    readonly dispose: ReturnType<typeof vi.fn>;
    readonly getDiagnostics: () => GLRendererDiagnostics;
    readonly getMemoryUsageBytes: () => number;
    readonly initialize: ReturnType<typeof vi.fn>;
    readonly renderFrame: ReturnType<typeof vi.fn>;
  } => {
    if (mockedState.createRendererError !== null) {
      throw mockedState.createRendererError;
    }

    const renderer = {
      clear: vi.fn(),
      dispose: vi.fn(),
      getDiagnostics: (): GLRendererDiagnostics => mockedState.diagnostics,
      getMemoryUsageBytes: (): number => mockedState.memoryUsageBytes,
      initialize: vi.fn((): void => {
        if (mockedState.initializeError !== null) {
          throw mockedState.initializeError;
        }
      }),
      renderFrame: vi.fn((): void => undefined),
    };

    mockedState.rendererInstances.push(renderer);
    return renderer;
  },
}));

function RenderHarness(
  { onSnapshot }: { readonly onSnapshot: (snapshot: RenderSnapshot) => void },
): JSX.Element {
  const {
    canvasRef,
    isContextLost,
    previewSourceMode,
    previewStatus,
    rendererError,
    rendererRuntime,
    webglDiagnostics,
  } = useRenderController();

  useEffect((): void => {
    onSnapshot({
      backend: webglDiagnostics.backend,
      diagnosticsMessage: webglDiagnostics.message,
      diagnosticsReason: webglDiagnostics.failureReason,
      isContextLost,
      previewSourceMode,
      previewStatus,
      rendererError,
      runtimeMessage: rendererRuntime.message,
      runtimeReason: rendererRuntime.reason,
      runtimeStatus: rendererRuntime.status,
    });
  }, [
    isContextLost,
    onSnapshot,
    previewSourceMode,
    previewStatus,
    rendererError,
    rendererRuntime.message,
    rendererRuntime.reason,
    rendererRuntime.status,
    webglDiagnostics.backend,
    webglDiagnostics.failureReason,
    webglDiagnostics.message,
  ]);

  return <canvas data-testid="render-surface" height={360} ref={canvasRef} width={640} />;
}

describe('RenderController facade contract', () => {
  beforeEach((): void => {
    mockedState.createRendererError = null;
    mockedState.diagnostics = createDiagnostics();
    mockedState.initializeError = null;
    mockedState.memoryUsageBytes = 0;
    mockedState.rendererInstances = [];
    mockedState.reportWebglFrameTime.mockReset();
    mockedState.setFboMemoryUsageBytes.mockReset();
    vi.stubGlobal('requestAnimationFrame', vi.fn((): number => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach((): void => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('publishes ready runtime state when the renderer initializes WebGL successfully', async () => {
    const snapshots: RenderSnapshot[] = [];

    render(
      <RenderController>
        <RenderHarness
          onSnapshot={(snapshot: RenderSnapshot): void => {
            snapshots.push(snapshot);
          }}
        />
      </RenderController>,
    );

    await waitFor(() => {
      expect(snapshots.at(-1)?.runtimeStatus).toBe('ready');
    });

    expect(snapshots.at(-1)).toMatchObject({
      backend: 'webgl',
      diagnosticsMessage: null,
      diagnosticsReason: null,
      isContextLost: false,
      previewSourceMode: 'live',
      previewStatus: 'idle',
      rendererError: null,
      runtimeMessage: null,
      runtimeReason: null,
      runtimeStatus: 'ready',
    });
  });

  it('keeps fallback backend, reason, and error messaging synchronized across the facade', async () => {
    mockedState.diagnostics = createDiagnostics({
      backend: 'canvas-2d',
      experimentalContextAvailable: false,
      failureReason: 'webgl-unavailable',
      message:
        'WebGL is unavailable in this browser or is currently blocked by GPU/driver settings.',
      webglContextAvailable: false,
    });
    const snapshots: RenderSnapshot[] = [];

    render(
      <RenderController>
        <RenderHarness
          onSnapshot={(snapshot: RenderSnapshot): void => {
            snapshots.push(snapshot);
          }}
        />
      </RenderController>,
    );

    await waitFor(() => {
      expect(snapshots.at(-1)?.runtimeStatus).toBe('fallback');
    });

    expect(snapshots.at(-1)).toMatchObject({
      backend: 'canvas-2d',
      diagnosticsMessage:
        'WebGL is unavailable in this browser or is currently blocked by GPU/driver settings.',
      diagnosticsReason: 'webgl-unavailable',
      isContextLost: false,
      rendererError:
        'WebGL is unavailable in this browser or is currently blocked by GPU/driver settings.',
      runtimeMessage:
        'WebGL is unavailable in this browser or is currently blocked by GPU/driver settings.',
      runtimeReason: 'webgl-unavailable',
      runtimeStatus: 'fallback',
    });
  });

  it('publishes startup initialization failures coherently when the renderer cannot start', async () => {
    mockedState.diagnostics = createDiagnostics({
      backend: 'unavailable',
      failureReason: 'context-acquired-lost',
      message: 'WebGL context was already lost during initialization.',
    });
    mockedState.initializeError = new Error(
      'WebGL context was already lost during initialization.',
    );
    const snapshots: RenderSnapshot[] = [];

    render(
      <RenderController>
        <RenderHarness
          onSnapshot={(snapshot: RenderSnapshot): void => {
            snapshots.push(snapshot);
          }}
        />
      </RenderController>,
    );

    await waitFor(() => {
      expect(snapshots.at(-1)?.runtimeStatus).toBe('error');
    });

    expect(snapshots.at(-1)).toMatchObject({
      backend: 'unavailable',
      diagnosticsMessage: 'WebGL context was already lost during initialization.',
      diagnosticsReason: 'context-acquired-lost',
      isContextLost: false,
      rendererError: 'WebGL context was already lost during initialization.',
      runtimeMessage: 'WebGL context was already lost during initialization.',
      runtimeReason: 'context-acquired-lost',
      runtimeStatus: 'error',
    });
    expect(mockedState.rendererInstances[0]?.dispose).toHaveBeenCalledTimes(1);
  });

  it('publishes construction-time renderer failures coherently when createStudioRenderer throws', async () => {
    mockedState.createRendererError = new Error('Renderer construction failed.');
    const snapshots: RenderSnapshot[] = [];

    render(
      <RenderController>
        <RenderHarness
          onSnapshot={(snapshot: RenderSnapshot): void => {
            snapshots.push(snapshot);
          }}
        />
      </RenderController>,
    );

    await waitFor(() => {
      expect(snapshots.at(-1)?.runtimeStatus).toBe('error');
    });

    expect(snapshots.at(-1)).toMatchObject({
      backend: 'unavailable',
      diagnosticsMessage: null,
      diagnosticsReason: null,
      isContextLost: false,
      rendererError: 'Renderer construction failed.',
      runtimeMessage: 'Renderer construction failed.',
      runtimeReason: 'renderer-unavailable',
      runtimeStatus: 'error',
    });
    expect(mockedState.rendererInstances).toHaveLength(0);
  });
});
