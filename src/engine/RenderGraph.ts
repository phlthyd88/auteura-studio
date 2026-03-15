import type { RenderFrameState, RenderableSourceElement } from '../types/render';
import { ResourcePool, type ResourcePoolTextureName } from './ResourcePool';
import type { CompositionRenderAdapter } from './render/CompositionRenderAdapter';

export interface RenderGraphResources {
  canvasHeight: number;
  canvasWidth: number;
  internalHeight: number;
  internalWidth: number;
  readonly resourcePool: ResourcePool;
}

export interface RenderGraphPass {
  readonly bypassInPreview?: boolean;
  dispose: (context: WebGLRenderingContext, resources: RenderGraphResources) => void;
  initialize: (context: WebGLRenderingContext, resources: RenderGraphResources) => void;
  render: (
    context: WebGLRenderingContext,
    resources: RenderGraphResources,
    frameState: RenderFrameState,
  ) => void;
  resize: (
    context: WebGLRenderingContext,
    resources: RenderGraphResources,
    width: number,
    height: number,
  ) => void;
}

export interface RenderGraphPassNode {
  readonly id: string;
  readonly isEnabled?: (frameState: RenderFrameState) => boolean;
  readonly pass: RenderGraphPass;
}

const resourceDescriptors: readonly {
  readonly kind: 'render-target' | 'texture';
  readonly name: ResourcePoolTextureName;
}[] = [
  {
    kind: 'render-target',
    name: 'beautyProcessed',
  },
  {
    kind: 'render-target',
    name: 'clipEffectA',
  },
  {
    kind: 'render-target',
    name: 'clipEffectB',
  },
  {
    kind: 'render-target',
    name: 'layerComposite',
  },
  {
    kind: 'texture',
    name: 'original',
  },
  {
    kind: 'render-target',
    name: 'processed',
  },
  {
    kind: 'render-target',
    name: 'refinedMask',
  },
  {
    kind: 'render-target',
    name: 'composited',
  },
] as const;

export class RenderGraph {
  private resources: RenderGraphResources | null = null;

  public constructor(private readonly nodes: readonly RenderGraphPassNode[]) {}

  dispose(context: WebGLRenderingContext): void {
    if (this.resources === null) {
      return;
    }

    [...this.nodes].reverse().forEach((node: RenderGraphPassNode): void => {
      node.pass.dispose(context, this.resources as RenderGraphResources);
    });
    this.resources.resourcePool.dispose(context);
    this.resources = null;
  }

  initialize(context: WebGLRenderingContext, width: number, height: number): void {
    this.dispose(context);

    this.resources = {
      canvasHeight: Math.max(1, height),
      canvasWidth: Math.max(1, width),
      internalHeight: Math.max(1, height),
      internalWidth: Math.max(1, width),
      resourcePool: new ResourcePool(resourceDescriptors),
    };

    context.pixelStorei(context.UNPACK_FLIP_Y_WEBGL, 1);
    this.resources.resourcePool.initialize(
      context,
      this.resources.canvasWidth,
      this.resources.canvasHeight,
      1,
    );
    this.resources.internalWidth = this.resources.resourcePool.getRenderTargetWidth();
    this.resources.internalHeight = this.resources.resourcePool.getRenderTargetHeight();
    this.nodes.forEach((node: RenderGraphPassNode): void => {
      node.pass.initialize(context, this.resources as RenderGraphResources);
      node.pass.resize(
        context,
        this.resources as RenderGraphResources,
        this.resources?.canvasWidth ?? 1,
        this.resources?.canvasHeight ?? 1,
      );
    });
  }

  render(
    context: WebGLRenderingContext,
    sourceElement: RenderableSourceElement | null,
    frameState: RenderFrameState,
    compositionAdapter?: CompositionRenderAdapter | null,
  ): void {
    if (this.resources === null) {
      throw new Error('RenderGraph render invoked before initialization.');
    }

    this.resize(
      context,
      this.resources.canvasWidth,
      this.resources.canvasHeight,
      frameState.performance.exportMode ? 1 : frameState.performance.qualityScale,
    );

    compositionAdapter?.synchronizeSourceTextures(context, this.resources.resourcePool);

    if (sourceElement !== null) {
      context.activeTexture(context.TEXTURE0);
      context.bindTexture(
        context.TEXTURE_2D,
        this.resources.resourcePool.getTexture('original'),
      );
      context.texImage2D(
        context.TEXTURE_2D,
        0,
        context.RGBA,
        context.RGBA,
        context.UNSIGNED_BYTE,
        sourceElement,
      );
    }

    this.nodes.forEach((node: RenderGraphPassNode): void => {
      if (frameState.passDirectives.bypassPassIds.includes(node.id)) {
        return;
      }

      if (
        frameState.performance.isPlaybackActive &&
        !frameState.performance.exportMode &&
        frameState.performance.bypassHeavyPreviewPasses &&
        node.pass.bypassInPreview === true
      ) {
        return;
      }

      if (node.isEnabled !== undefined && !node.isEnabled(frameState)) {
        return;
      }

      node.pass.render(context, this.resources as RenderGraphResources, frameState);
    });
  }

  getMemoryUsageBytes(): number {
    return this.resources?.resourcePool.getMemoryUsageBytes() ?? 0;
  }

  resize(
    context: WebGLRenderingContext,
    width: number,
    height: number,
    qualityScale = this.resources?.resourcePool.getQualityScale() ?? 1,
  ): void {
    if (this.resources === null) {
      return;
    }

    const nextWidth = Math.max(1, width);
    const nextHeight = Math.max(1, height);
    const qualityScaleChanged = this.resources.resourcePool.getQualityScale() !== qualityScale;

    if (
      this.resources.canvasWidth !== nextWidth ||
      this.resources.canvasHeight !== nextHeight ||
      qualityScaleChanged
    ) {
      this.resources.canvasWidth = nextWidth;
      this.resources.canvasHeight = nextHeight;
      this.resources.resourcePool.resize(context, nextWidth, nextHeight, qualityScale);
      this.resources.internalWidth = this.resources.resourcePool.getRenderTargetWidth();
      this.resources.internalHeight = this.resources.resourcePool.getRenderTargetHeight();
    }

    this.nodes.forEach((node: RenderGraphPassNode): void => {
      node.pass.resize(context, this.resources as RenderGraphResources, nextWidth, nextHeight);
    });
  }
}
