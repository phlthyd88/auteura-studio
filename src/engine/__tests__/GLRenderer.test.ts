import { afterEach, describe, expect, it, vi } from 'vitest';
import { GLRenderer } from '../GLRenderer';
import { RenderMode, type RenderFrameState } from '../../types/render';
import {
  defaultColorGradingSettings,
  defaultTransformSettings,
} from '../../types/color';
import { defaultPictureInPictureConfig } from '../../types/compositor';
import { defaultBeautyRuntimeState } from '../../types/beauty';

interface MockWebglContext {
  readonly COLOR_BUFFER_BIT: number;
  readonly MAX_RENDERBUFFER_SIZE: number;
  readonly MAX_TEXTURE_SIZE: number;
  readonly RGBA: number;
  readonly TEXTURE_2D: number;
  readonly UNSIGNED_BYTE: number;
  clear: ReturnType<typeof vi.fn>;
  createShader: ReturnType<typeof vi.fn>;
  getExtension: ReturnType<typeof vi.fn>;
  getParameter: ReturnType<typeof vi.fn>;
  isContextLost: ReturnType<typeof vi.fn>;
  texImage2D: ReturnType<typeof vi.fn>;
  viewport: ReturnType<typeof vi.fn>;
}

interface MockCanvas2DContext {
  clearRect: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
  filter: string;
  restore: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
}

function createRenderFrameState(qualityScale: number): RenderFrameState {
  return {
    aiState: {
      backgroundBlurEnabled: false,
      backgroundBlurStrength: 0.65,
      beauty: defaultBeautyRuntimeState,
      faceRegions: [],
      segmentationMask: null,
    },
    activeLut: null,
    colorGrading: defaultColorGradingSettings,
    comparison: {
      mode: 'off',
      splitDirection: 'vertical',
      splitPosition: 0.5,
    },
    composition: null,
    compositionLayerBindings: [],
    maskRefinement: {
      edgeSoftness: 0.18,
      enabled: true,
      threshold: 0.42,
    },
    mode: RenderMode.Passthrough,
    passDirectives: {
      bypassPassIds: [],
    },
    performance: {
      bypassHeavyPreviewPasses: false,
      exportMode: false,
      isPlaybackActive: false,
      qualityScale,
    },
    pictureInPicture: defaultPictureInPictureConfig,
    timeSeconds: 0,
    transform: defaultTransformSettings,
  };
}

function createHarness(): {
  canvas: HTMLCanvasElement;
  context2d: MockCanvas2DContext;
  context: MockWebglContext;
  getContext: ReturnType<typeof vi.fn>;
  pipeline: {
    dispose: ReturnType<typeof vi.fn>;
    getMemoryUsageBytes: ReturnType<typeof vi.fn>;
    initialize: ReturnType<typeof vi.fn>;
    render: ReturnType<typeof vi.fn>;
    resize: ReturnType<typeof vi.fn>;
  };
} {
  const context: MockWebglContext = {
    COLOR_BUFFER_BIT: 0x4000,
    MAX_RENDERBUFFER_SIZE: 0x84e8,
    MAX_TEXTURE_SIZE: 0x0d33,
    RGBA: 0x1908,
    TEXTURE_2D: 0x0de1,
    UNSIGNED_BYTE: 0x1401,
    clear: vi.fn(),
    createShader: vi.fn(),
    getExtension: vi.fn(),
    getParameter: vi.fn((parameter: number) => {
      if (parameter === 0x84e8 || parameter === 0x0d33) {
        return 4096;
      }

      return null;
    }),
    isContextLost: vi.fn(() => false),
    texImage2D: vi.fn(),
    viewport: vi.fn(),
  };
  const context2d: MockCanvas2DContext = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    filter: 'none',
    restore: vi.fn(),
    save: vi.fn(),
  };
  const getContext = vi.fn((type: string) => (type === '2d' ? context2d : context));
  const canvas = {
    clientHeight: 360,
    clientWidth: 640,
    getContext,
    height: 360,
    width: 640,
  } as unknown as HTMLCanvasElement;
  const pipeline = {
    dispose: vi.fn(),
    getMemoryUsageBytes: vi.fn(() => 0),
    initialize: vi.fn(),
    render: vi.fn(),
    resize: vi.fn(),
  };

  return {
    canvas,
    context2d,
    context,
    getContext,
    pipeline,
  };
}

describe('GLRenderer', (): void => {
  const originalWindow = globalThis.window;

  afterEach((): void => {
    globalThis.window = originalWindow;
  });

  it('reuses the same WebGL context across quality-scale changes', (): void => {
    globalThis.window = {
      devicePixelRatio: 1,
    } as Window & typeof globalThis;

    const { canvas, context, getContext, pipeline } = createHarness();
    const renderer = new GLRenderer(canvas, pipeline as never);

    renderer.initialize();
    renderer.renderFrame(null, createRenderFrameState(1));
    renderer.renderFrame(null, createRenderFrameState(0.65));

    expect(renderer.getDiagnostics().backend).toBe('webgl');
    expect(getContext).toHaveBeenCalledTimes(1);
    expect(pipeline.initialize).toHaveBeenCalledTimes(1);
    expect(pipeline.resize).toHaveBeenCalledWith(context, 640, 360, 1);
    expect(pipeline.resize).toHaveBeenCalledWith(context, 640, 360, 0.65);
  });

  it('explicitly loses the WebGL context on final disposal', (): void => {
    globalThis.window = {
      devicePixelRatio: 1,
    } as Window & typeof globalThis;

    const loseContext = vi.fn();
    const { canvas, context, pipeline } = createHarness();
    context.getExtension.mockReturnValue({
      loseContext,
    });
    const renderer = new GLRenderer(canvas, pipeline as never);

    renderer.initialize();
    renderer.dispose();

    expect(pipeline.dispose).toHaveBeenCalledWith(context);
    expect(loseContext).toHaveBeenCalledTimes(1);
  });

  it('keeps disposal idempotent across repeated shutdown calls', (): void => {
    globalThis.window = {
      devicePixelRatio: 1,
    } as Window & typeof globalThis;

    const loseContext = vi.fn();
    const { canvas, context, pipeline } = createHarness();
    context.getExtension.mockReturnValue({
      loseContext,
    });
    const renderer = new GLRenderer(canvas, pipeline as never);

    renderer.initialize();
    renderer.dispose();
    renderer.dispose();

    expect(pipeline.dispose).toHaveBeenCalledTimes(1);
    expect(pipeline.dispose).toHaveBeenCalledWith(context);
    expect(loseContext).toHaveBeenCalledTimes(1);
  });

  it('falls back to 2d preview when WebGL initialization fails', (): void => {
    globalThis.window = {
      devicePixelRatio: 1,
    } as Window & typeof globalThis;

    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { canvas, context2d, pipeline } = createHarness();
    pipeline.initialize.mockImplementation(() => {
      throw new Error('Render targets failed');
    });
    const renderer = new GLRenderer(canvas, pipeline as never);

    renderer.initialize();
    renderer.renderFrame(canvas, createRenderFrameState(1));

    expect(consoleWarn).toHaveBeenCalled();
    expect(renderer.getDiagnostics().backend).toBe('canvas-2d');
    expect(renderer.getDiagnostics().failureReason).toBe('initialization-failed');
    expect(context2d.drawImage).toHaveBeenCalledWith(canvas, 0, 0, 640, 360);

    consoleWarn.mockRestore();
  });

  it('falls back to 2d preview when the acquired WebGL context is already lost', (): void => {
    globalThis.window = {
      devicePixelRatio: 1,
    } as Window & typeof globalThis;

    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { canvas, context, context2d, pipeline } = createHarness();
    context.isContextLost.mockReturnValue(true);
    const renderer = new GLRenderer(canvas, pipeline as never);

    renderer.initialize();
    renderer.renderFrame(canvas, createRenderFrameState(1));

    expect(pipeline.initialize).not.toHaveBeenCalled();
    expect(renderer.getDiagnostics()).toMatchObject({
      backend: 'canvas-2d',
      failureReason: 'context-acquired-lost',
      message: 'WebGL context was acquired in a lost state.',
    });
    expect(context2d.drawImage).toHaveBeenCalledWith(canvas, 0, 0, 640, 360);
    expect(consoleWarn).toHaveBeenCalled();

    consoleWarn.mockRestore();
  });

  it('falls back to 2d preview when WebGL GPU limits are unreadable', (): void => {
    globalThis.window = {
      devicePixelRatio: 1,
    } as Window & typeof globalThis;

    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { canvas, context, context2d, pipeline } = createHarness();
    context.getParameter.mockReturnValue(null);
    const renderer = new GLRenderer(canvas, pipeline as never);

    renderer.initialize();
    renderer.renderFrame(canvas, createRenderFrameState(1));

    expect(pipeline.initialize).not.toHaveBeenCalled();
    expect(renderer.getDiagnostics()).toMatchObject({
      backend: 'canvas-2d',
      failureReason: 'gpu-limits-unreadable',
      message: 'WebGL context was acquired but GPU render-target limits were unreadable.',
    });
    expect(context2d.drawImage).toHaveBeenCalledWith(canvas, 0, 0, 640, 360);
    expect(consoleWarn).toHaveBeenCalled();

    consoleWarn.mockRestore();
  });

  it('falls back to 2d preview when a WebGL render pass throws after initialization', (): void => {
    globalThis.window = {
      devicePixelRatio: 1,
    } as Window & typeof globalThis;

    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { canvas, context, context2d, pipeline } = createHarness();
    pipeline.render.mockImplementation(() => {
      throw new Error('Transient pass failure');
    });
    const renderer = new GLRenderer(canvas, pipeline as never);

    renderer.initialize();
    renderer.renderFrame(canvas, createRenderFrameState(1));
    renderer.renderFrame(canvas, createRenderFrameState(1));

    expect(pipeline.dispose).toHaveBeenCalledWith(context);
    expect(renderer.getDiagnostics().backend).toBe('canvas-2d');
    expect(renderer.getDiagnostics().failureReason).toBe('render-failed');
    expect(context2d.drawImage).toHaveBeenCalledWith(canvas, 0, 0, 640, 360);
    expect(consoleWarn).toHaveBeenCalled();

    consoleWarn.mockRestore();
  });
});
