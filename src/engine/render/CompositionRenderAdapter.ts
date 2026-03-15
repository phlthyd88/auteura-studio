import type {
  TimelineCompositionInstruction,
  TimelineCompositionVisualLayer,
} from '../../types/compositor';
import type {
  RenderCompositionLayerBinding,
  RenderPassDirectiveState,
  RenderPerformanceState,
  RenderableSourceElement,
} from '../../types/render';
import type { ResourcePool } from '../ResourcePool';

export interface CompositionRenderState {
  readonly compositionLayerBindings: readonly RenderCompositionLayerBinding[];
  readonly composition: TimelineCompositionInstruction | null;
  readonly passDirectives: RenderPassDirectiveState;
  readonly performance: RenderPerformanceState;
  readonly sourceElement: RenderableSourceElement | null;
}

function clampQualityScale(qualityScale: number): number {
  return Math.max(0.5, Math.min(1, qualityScale));
}

function isRenderableSourceReady(sourceElement: RenderableSourceElement): boolean {
  if (
    typeof HTMLVideoElement !== 'undefined' &&
    sourceElement instanceof HTMLVideoElement
  ) {
    return sourceElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
  }

  if (
    typeof HTMLImageElement !== 'undefined' &&
    sourceElement instanceof HTMLImageElement
  ) {
    return sourceElement.complete && sourceElement.naturalWidth > 0 && sourceElement.naturalHeight > 0;
  }

  return sourceElement.width > 0 && sourceElement.height > 0;
}

function buildLayerBindings(
  instruction: TimelineCompositionInstruction,
  sourceBindings: ReadonlyMap<string, RenderableSourceElement>,
): readonly RenderCompositionLayerBinding[] {
  return instruction.layers.map(
    (layer: TimelineCompositionVisualLayer): RenderCompositionLayerBinding => {
      const sourceElement = sourceBindings.get(layer.sourceId) ?? null;

      return {
        blendMode: layer.blendMode,
        clipId: layer.clipId,
        effects: layer.effects,
        opacity: layer.opacity,
        sourceElement,
        sourceId: layer.sourceId,
        sourceReady: sourceElement === null ? false : isRenderableSourceReady(sourceElement),
        sourceTextureId: layer.sourceId,
        zIndex: layer.zIndex,
      };
    },
  );
}

function collectActiveSourceIds(instruction: TimelineCompositionInstruction | null): ReadonlySet<string> {
  if (instruction === null) {
    return new Set<string>();
  }

  const activeSourceIds = new Set<string>();

  instruction.layers.forEach((layer: TimelineCompositionVisualLayer): void => {
    activeSourceIds.add(layer.sourceId);
  });
  instruction.transitions.forEach((transition): void => {
    if (transition.sourceA !== null) {
      activeSourceIds.add(transition.sourceA);
    }

    activeSourceIds.add(transition.sourceB);
  });

  return activeSourceIds;
}

export class CompositionRenderAdapter {
  private currentInstruction: TimelineCompositionInstruction | null = null;

  private readonly sourceBindings = new Map<string, RenderableSourceElement>();

  bindSource(sourceId: string, sourceElement: RenderableSourceElement | null): void {
    if (sourceElement === null) {
      this.sourceBindings.delete(sourceId);
      return;
    }

    this.sourceBindings.set(sourceId, sourceElement);
  }

  clearInstruction(): void {
    this.currentInstruction = null;
  }

  deriveRenderState(basePerformance: RenderPerformanceState): CompositionRenderState {
    const instruction = this.currentInstruction;

    if (instruction === null) {
      return {
        compositionLayerBindings: [],
        composition: null,
        passDirectives: {
          bypassPassIds: [],
        },
        performance: basePerformance,
        sourceElement: null,
      };
    }

    const exportMode = basePerformance.exportMode || instruction.policy.exportMode;
    const previewQualityScale = clampQualityScale(instruction.policy.previewQualityScale);
    const qualityScale = exportMode
      ? 1
      : Math.min(basePerformance.qualityScale, previewQualityScale);
    const bypassHeavyPreviewPasses =
      !exportMode && (basePerformance.bypassHeavyPreviewPasses || qualityScale < 1);
    const bypassPassIds =
      !exportMode && qualityScale < 1 ? ['mask-refinement'] : [];

    const layers =
      !exportMode && basePerformance.bypassHeavyPreviewPasses
        ? instruction.layers.slice(-1)
        : instruction.layers;
    const adaptedInstruction: TimelineCompositionInstruction = {
      ...instruction,
      layers,
    };

    return {
      compositionLayerBindings: buildLayerBindings(adaptedInstruction, this.sourceBindings),
      composition: adaptedInstruction,
      passDirectives: {
        bypassPassIds,
      },
      performance: {
        ...basePerformance,
        bypassHeavyPreviewPasses,
        exportMode,
        isPlaybackActive: basePerformance.isPlaybackActive || adaptedInstruction.metadata.isPlaying,
        qualityScale,
      },
      sourceElement: this.resolvePrimarySourceElement(adaptedInstruction),
    };
  }

  setInstruction(nextInstruction: TimelineCompositionInstruction | null): void {
    this.currentInstruction = nextInstruction;
  }

  synchronizeSourceTextures(
    context: WebGLRenderingContext,
    resourcePool: ResourcePool,
  ): void {
    const activeSourceIds = collectActiveSourceIds(this.currentInstruction);

    this.sourceBindings.forEach((_sourceElement: RenderableSourceElement, sourceId: string): void => {
      if (!activeSourceIds.has(sourceId)) {
        this.sourceBindings.delete(sourceId);
      }
    });

    resourcePool.getExternalTextureIds().forEach((sourceId: string): void => {
      if (!activeSourceIds.has(sourceId)) {
        resourcePool.releaseExternalTexture(context, sourceId);
      }
    });

    activeSourceIds.forEach((sourceId: string): void => {
      const sourceElement = this.sourceBindings.get(sourceId);

      if (sourceElement === undefined || !isRenderableSourceReady(sourceElement)) {
        return;
      }

      resourcePool.updateExternalTexture(context, sourceId, sourceElement);
    });
  }

  private resolvePrimarySourceElement(
    instruction: TimelineCompositionInstruction,
  ): RenderableSourceElement | null {
    if (instruction.layers.length === 0) {
      return null;
    }

    for (let index = instruction.layers.length - 1; index >= 0; index -= 1) {
      const layer = instruction.layers[index];

      if (layer === undefined) {
        continue;
      }

      const boundSource = this.sourceBindings.get(layer.sourceId);

      if (boundSource !== undefined) {
        return boundSource;
      }
    }

    return null;
  }
}
