import { RenderPipeline } from './RenderPipeline';
import type { RenderFrameState, RenderableSourceElement } from '../types/render';
import type { CompositionRenderAdapter } from './render/CompositionRenderAdapter';

interface GLRendererContextOptions {
  readonly alpha: boolean;
  readonly antialias: boolean;
  readonly preserveDrawingBuffer: boolean;
}

const defaultContextOptions: GLRendererContextOptions = {
  alpha: false,
  antialias: true,
  preserveDrawingBuffer: false,
};

export class GLRenderer {
  private context: WebGLRenderingContext | null = null;

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly pipeline: RenderPipeline,
    private readonly contextOptions: GLRendererContextOptions = defaultContextOptions,
  ) {}

  clear(): void {
    if (this.context === null) {
      return;
    }

    this.context.clear(this.context.COLOR_BUFFER_BIT);
  }

  dispose(): void {
    if (this.context === null) {
      return;
    }

    this.pipeline.dispose(this.context);
    this.context = null;
  }

  initialize(): void {
    const nextContext = getWebglContext(this.canvas, this.contextOptions);

    if (nextContext === null) {
      throw new Error(
        'WebGL is unavailable in this browser or is currently blocked by GPU/driver settings.',
      );
    }

    this.context = nextContext;
    this.resizeToDisplaySize();
    this.pipeline.initialize(nextContext, this.canvas.width, this.canvas.height);
  }

  getMemoryUsageBytes(): number {
    return this.pipeline.getMemoryUsageBytes();
  }

  renderFrame(
    sourceElement: RenderableSourceElement | null,
    frameState: RenderFrameState,
    compositionAdapter?: CompositionRenderAdapter | null,
  ): void {
    if (this.context === null) {
      throw new Error('GLRenderer render invoked before initialization.');
    }

    this.resizeToDisplaySize(frameState.performance.qualityScale);

    if (frameState.composition === null && (sourceElement === null || !isRenderableSourceReady(sourceElement))) {
      this.clear();
      return;
    }

    this.pipeline.render(this.context, sourceElement, frameState, compositionAdapter);
  }

  private resizeToDisplaySize(qualityScale = 1): void {
    if (this.context === null) {
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

    this.pipeline.resize(this.context, this.canvas.width, this.canvas.height, qualityScale);
  }
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
): WebGLRenderingContext | null {
  const primaryContext = canvas.getContext('webgl', contextOptions);

  if (isWebglRenderingContext(primaryContext)) {
    return primaryContext;
  }

  const fallbackContext = canvas.getContext('experimental-webgl', contextOptions);

  return isWebglRenderingContext(fallbackContext) ? fallbackContext : null;
}

function isRenderableSourceReady(sourceElement: RenderableSourceElement): boolean {
  if (sourceElement instanceof HTMLVideoElement) {
    return sourceElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
  }

  if (sourceElement instanceof HTMLImageElement) {
    return sourceElement.complete && sourceElement.naturalWidth > 0 && sourceElement.naturalHeight > 0;
  }

  return sourceElement.width > 0 && sourceElement.height > 0;
}
