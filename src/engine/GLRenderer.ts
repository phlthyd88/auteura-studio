import { RenderPipeline } from './RenderPipeline';
import { RenderMode, type RenderFrameState, type RenderableSourceElement } from '../types/render';
import type { CompositionRenderAdapter } from './render/CompositionRenderAdapter';

interface GLRendererContextOptions {
  readonly alpha: boolean;
  readonly antialias: boolean;
  readonly preserveDrawingBuffer: boolean;
}

export type GLRendererFailureReason =
  | 'context-acquired-lost'
  | 'gpu-limits-unreadable'
  | 'initialization-failed'
  | 'render-failed'
  | 'webgl-unavailable';

export interface GLRendererDiagnostics {
  readonly apiExposed: boolean;
  readonly backend: 'canvas-2d' | 'unavailable' | 'webgl';
  readonly experimentalContextAvailable: boolean;
  readonly failureReason: GLRendererFailureReason | null;
  readonly message: string | null;
  readonly webglContextAvailable: boolean;
}

const defaultContextOptions: GLRendererContextOptions = {
  alpha: false,
  antialias: true,
  preserveDrawingBuffer: false,
};

export class GLRenderer {
  private context: WebGLRenderingContext | null = null;
  private diagnostics: GLRendererDiagnostics = defaultDiagnostics;
  private fallbackContext: CanvasRenderingContext2D | null = null;
  private isDisposed = false;

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly pipeline: RenderPipeline,
    private readonly contextOptions: GLRendererContextOptions = defaultContextOptions,
  ) {}

  clear(): void {
    if (this.fallbackContext !== null) {
      this.fallbackContext.clearRect(0, 0, this.canvas.width, this.canvas.height);
      return;
    }

    if (this.context === null) {
      return;
    }

    this.context.clear(this.context.COLOR_BUFFER_BIT);
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;

    if (this.context !== null) {
      const activeContext = this.context;
      this.pipeline.dispose(activeContext);
      activeContext.getExtension('WEBGL_lose_context')?.loseContext?.();
      this.context = null;
    }

    this.fallbackContext = null;
  }

  initialize(): void {
    this.isDisposed = false;
    const nextContextResult = getWebglContext(this.canvas, this.contextOptions);
    this.diagnostics = {
      ...defaultDiagnostics,
      experimentalContextAvailable: nextContextResult.experimentalContextAvailable,
      webglContextAvailable: nextContextResult.webglContextAvailable,
    };
    const nextContext = nextContextResult.context;

    if (nextContext !== null) {
      const validationError = validateWebglContext(nextContext);

      if (validationError === null) {
        try {
          this.context = nextContext;
          this.fallbackContext = null;
          this.diagnostics = {
            ...this.diagnostics,
            backend: 'webgl',
            message: null,
          };
          this.resizeToDisplaySize();
          this.pipeline.initialize(nextContext, this.canvas.width, this.canvas.height);
          return;
        } catch (initializationError: unknown) {
          if (this.context !== null) {
            this.pipeline.dispose(this.context);
          }
          this.context = null;

          if (
            this.initializeCanvasFallback(
              'WebGL initialization failed. Falling back to 2D preview.',
              'initialization-failed',
              initializationError,
            )
          ) {
            return;
          }

          throw initializationError;
        }
      }

      if (
        this.initializeCanvasFallback(
          validationError,
          typeof nextContext.isContextLost === 'function' && nextContext.isContextLost()
            ? 'context-acquired-lost'
            : 'gpu-limits-unreadable',
        )
      ) {
        return;
      }

      throw new Error(validationError);
    }

    if (
      this.initializeCanvasFallback(
        'WebGL is unavailable in this browser or is currently blocked by GPU/driver settings.',
        'webgl-unavailable',
      )
    ) {
      return;
    }

    throw new Error(
      'WebGL is unavailable in this browser or is currently blocked by GPU/driver settings.',
    );
  }

  getMemoryUsageBytes(): number {
    if (this.fallbackContext !== null) {
      return 0;
    }

    return this.pipeline.getMemoryUsageBytes();
  }

  getDiagnostics(): GLRendererDiagnostics {
    return this.diagnostics;
  }

  renderFrame(
    sourceElement: RenderableSourceElement | null,
    frameState: RenderFrameState,
    compositionAdapter?: CompositionRenderAdapter | null,
  ): void {
    if (this.fallbackContext !== null) {
      this.resizeToDisplaySize(frameState.performance.qualityScale);
      this.renderFallbackFrame(sourceElement, frameState);
      return;
    }

    if (this.context === null) {
      throw new Error('GLRenderer render invoked before initialization.');
    }

    this.resizeToDisplaySize(frameState.performance.qualityScale);

    if (frameState.composition === null && (sourceElement === null || !isRenderableSourceReady(sourceElement))) {
      this.clear();
      return;
    }

    try {
      this.pipeline.render(this.context, sourceElement, frameState, compositionAdapter);
    } catch (renderError: unknown) {
      if (this.context !== null) {
        this.pipeline.dispose(this.context);
      }
      this.context = null;

      if (
        this.initializeCanvasFallback(
          'WebGL preview failed during rendering. Falling back to 2D preview.',
          'render-failed',
          renderError,
        )
      ) {
        this.renderFallbackFrame(sourceElement, frameState);
        return;
      }

      throw renderError;
    }
  }

  private resizeToDisplaySize(qualityScale = 1): void {
    if (this.context === null && this.fallbackContext === null) {
      return;
    }

    const devicePixelRatio = window.devicePixelRatio || 1;
    const baseWidth =
      this.canvas.clientWidth > 0 ? this.canvas.clientWidth : this.canvas.width;
    const baseHeight =
      this.canvas.clientHeight > 0 ? this.canvas.clientHeight : this.canvas.height;
    const nextWidth = Math.max(1, Math.floor(baseWidth * devicePixelRatio));
    const nextHeight = Math.max(1, Math.floor(baseHeight * devicePixelRatio));

    if (this.canvas.width !== nextWidth || this.canvas.height !== nextHeight) {
      this.canvas.width = nextWidth;
      this.canvas.height = nextHeight;
    }

    if (this.context !== null) {
      this.pipeline.resize(this.context, this.canvas.width, this.canvas.height, qualityScale);
    }
  }

  private initializeCanvasFallback(
    message: string,
    failureReason: GLRendererFailureReason,
    error?: unknown,
  ): boolean {
    const nextFallbackContext = this.canvas.getContext('2d');

    if (nextFallbackContext === null) {
      this.diagnostics = {
        ...this.diagnostics,
        backend: 'unavailable',
        failureReason,
        message,
      };
      return false;
    }

    if (error === undefined) {
      console.warn(message);
    } else {
      console.warn(message, error);
    }
    this.context = null;
    this.fallbackContext = nextFallbackContext;
    this.diagnostics = {
      ...this.diagnostics,
      backend: 'canvas-2d',
      failureReason,
      message,
    };
    this.resizeToDisplaySize();
    return true;
  }

  private renderFallbackFrame(
    sourceElement: RenderableSourceElement | null,
    frameState: RenderFrameState,
  ): void {
    if (this.fallbackContext === null) {
      return;
    }

    const context = this.fallbackContext;
    const width = this.canvas.width;
    const height = this.canvas.height;

    context.clearRect(0, 0, width, height);

    if (sourceElement === null || !isRenderableSourceReady(sourceElement)) {
      return;
    }

    context.save();
    context.filter = resolveCanvasFilter(frameState);
    context.drawImage(sourceElement, 0, 0, width, height);
    context.restore();
  }
}

function resolveCanvasFilter(frameState: RenderFrameState): string {
  switch (frameState.mode) {
    case RenderMode.Monochrome:
      return 'grayscale(1)';
    case RenderMode.Inverted:
      return 'invert(1)';
    default:
      return 'none';
  }
}

function isFinitePositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

const defaultDiagnostics: GLRendererDiagnostics = {
  apiExposed: typeof WebGLRenderingContext !== 'undefined',
  backend: 'unavailable',
  experimentalContextAvailable: false,
  failureReason: null,
  message: null,
  webglContextAvailable: false,
};

function validateWebglContext(context: WebGLRenderingContext): string | null {
  if (typeof context.isContextLost === 'function' && context.isContextLost()) {
    return 'WebGL context was acquired in a lost state.';
  }

  const maxTextureSize: unknown = context.getParameter(context.MAX_TEXTURE_SIZE);
  const maxRenderbufferSize: unknown = context.getParameter(context.MAX_RENDERBUFFER_SIZE);

  if (!isFinitePositiveNumber(maxTextureSize) || !isFinitePositiveNumber(maxRenderbufferSize)) {
    return 'WebGL context was acquired but GPU render-target limits were unreadable.';
  }

  return null;
}

function isWebglRenderingContext(value: unknown): value is WebGLRenderingContext {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<WebGLRenderingContext>;

  return (
    typeof candidate.clear === 'function' &&
    typeof candidate.createShader === 'function' &&
    typeof candidate.viewport === 'function'
  );
}

function getWebglContext(
  canvas: HTMLCanvasElement,
  contextOptions: WebGLContextAttributes,
): {
  readonly context: WebGLRenderingContext | null;
  readonly experimentalContextAvailable: boolean;
  readonly webglContextAvailable: boolean;
} {
  const primaryContext = canvas.getContext('webgl', contextOptions);
  const webglContextAvailable = isWebglRenderingContext(primaryContext);

  if (webglContextAvailable) {
    return {
      context: primaryContext,
      experimentalContextAvailable: false,
      webglContextAvailable: true,
    };
  }

  const fallbackContext = canvas.getContext('experimental-webgl', contextOptions);
  const experimentalContextAvailable = isWebglRenderingContext(fallbackContext);

  return {
    context: experimentalContextAvailable ? fallbackContext : null,
    experimentalContextAvailable,
    webglContextAvailable,
  };
}

function isRenderableSourceReady(sourceElement: RenderableSourceElement): boolean {
  if (typeof HTMLVideoElement !== 'undefined' && sourceElement instanceof HTMLVideoElement) {
    return sourceElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
  }

  if (typeof HTMLImageElement !== 'undefined' && sourceElement instanceof HTMLImageElement) {
    return sourceElement.complete && sourceElement.naturalWidth > 0 && sourceElement.naturalHeight > 0;
  }

  return sourceElement.width > 0 && sourceElement.height > 0;
}
