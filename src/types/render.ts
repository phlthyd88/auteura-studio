import type {
  ColorGradingSettings,
  LoadedLut,
  TransformSettings,
} from './color';
import type { BeautyRuntimeState } from './beauty';
import type { TimelineBlendMode, TimelineClipEffect } from '../models/Timeline';
import type { PictureInPictureConfig, TimelineCompositionInstruction } from './compositor';
import type { VisionFaceRegion, VisionSegmentationMask } from './vision';

export type RenderableSourceElement = HTMLCanvasElement | HTMLImageElement | HTMLVideoElement;

export enum RenderMode {
  Passthrough = 'passthrough',
  Monochrome = 'monochrome',
  Inverted = 'inverted',
}

export type RenderComparisonMode = 'bypass' | 'off' | 'split' | 'wipe';
export type RenderSplitDirection = 'horizontal' | 'vertical';

export interface OverlayConfig {
  readonly showFrameGuide: boolean;
  readonly showGrid: boolean;
}

export interface RenderAIState {
  readonly backgroundBlurEnabled: boolean;
  readonly backgroundBlurStrength: number;
  readonly beauty: BeautyRuntimeState;
  readonly faceRegions: readonly VisionFaceRegion[];
  readonly segmentationMask: VisionSegmentationMask | null;
}

export interface RenderComparisonConfig {
  readonly mode: RenderComparisonMode;
  readonly splitDirection: RenderSplitDirection;
  readonly splitPosition: number;
}

export interface RenderMaskRefinementConfig {
  readonly edgeSoftness: number;
  readonly enabled: boolean;
  readonly threshold: number;
}

export interface RenderPerformanceState {
  readonly bypassHeavyPreviewPasses: boolean;
  readonly exportMode: boolean;
  readonly isPlaybackActive: boolean;
  readonly qualityScale: number;
}

export interface RenderPassDirectiveState {
  readonly bypassPassIds: readonly string[];
}

export interface RenderCompositionLayerBinding {
  readonly blendMode: TimelineBlendMode;
  readonly clipId: string;
  readonly effects: readonly TimelineClipEffect[];
  readonly opacity: number;
  readonly sourceElement: RenderableSourceElement | null;
  readonly sourceId: string;
  readonly sourceReady: boolean;
  readonly sourceTextureId: string;
  readonly zIndex: number;
}

export interface RenderFrameState {
  readonly aiState: RenderAIState;
  readonly activeLut: LoadedLut | null;
  readonly colorGrading: ColorGradingSettings;
  readonly compositionLayerBindings: readonly RenderCompositionLayerBinding[];
  readonly comparison: RenderComparisonConfig;
  readonly composition: TimelineCompositionInstruction | null;
  readonly maskRefinement: RenderMaskRefinementConfig;
  readonly mode: RenderMode;
  readonly passDirectives: RenderPassDirectiveState;
  readonly performance: RenderPerformanceState;
  readonly pictureInPicture: PictureInPictureConfig;
  readonly timeSeconds: number;
  readonly transform: TransformSettings;
}

export interface RenderGraphPassDescriptor {
  readonly id: string;
  readonly order: number;
}

export const defaultRenderComparisonConfig: RenderComparisonConfig = {
  mode: 'off',
  splitDirection: 'vertical',
  splitPosition: 0.5,
};

export const defaultRenderMaskRefinementConfig: RenderMaskRefinementConfig = {
  edgeSoftness: 0.18,
  enabled: true,
  threshold: 0.42,
};

export const defaultRenderPassDirectives: RenderPassDirectiveState = {
  bypassPassIds: [],
};

export const renderGraphPassOrder: readonly RenderGraphPassDescriptor[] = [
  {
    id: 'layer-composite',
    order: 0,
  },
  {
    id: 'transition',
    order: 1,
  },
  {
    id: 'mask-refinement',
    order: 2,
  },
  {
    id: 'beauty',
    order: 3,
  },
  {
    id: 'core-color',
    order: 4,
  },
  {
    id: 'comparison',
    order: 5,
  },
  {
    id: 'picture-in-picture',
    order: 6,
  },
] as const;

export const renderModeOrder: readonly RenderMode[] = [
  RenderMode.Passthrough,
  RenderMode.Monochrome,
  RenderMode.Inverted,
];
