import { RenderGraph, type RenderGraphPassNode } from './RenderGraph';
import type { RenderFrameState, RenderableSourceElement } from '../types/render';
import type { CompositionRenderAdapter } from './render/CompositionRenderAdapter';

export class RenderPipeline {
  private readonly renderGraph: RenderGraph;

  public constructor(nodes: readonly RenderGraphPassNode[]) {
    this.renderGraph = new RenderGraph(nodes);
  }

  dispose(context: WebGLRenderingContext): void {
    this.renderGraph.dispose(context);
  }

  initialize(context: WebGLRenderingContext, width: number, height: number): void {
    this.renderGraph.initialize(context, width, height);
  }

  getMemoryUsageBytes(): number {
    return this.renderGraph.getMemoryUsageBytes();
  }

  render(
    context: WebGLRenderingContext,
    sourceElement: RenderableSourceElement | null,
    frameState: RenderFrameState,
    compositionAdapter?: CompositionRenderAdapter | null,
  ): void {
    this.renderGraph.render(context, sourceElement, frameState, compositionAdapter);
  }

  resize(
    context: WebGLRenderingContext,
    width: number,
    height: number,
    qualityScale = 1,
  ): void {
    this.renderGraph.resize(context, width, height, qualityScale);
  }
}
