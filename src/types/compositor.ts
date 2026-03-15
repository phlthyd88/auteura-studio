import type {
  TimelineAudioCompositionInstruction,
  TimelineBlendMode,
  TimelineClipEffect,
  TimelineClipSource,
  TimelineClipTransform,
  TimelineTransitionCurve,
  TimelineTransitionPlacement,
  TimelineTransitionType,
} from '../models/Timeline';

export type CompositorSecondarySource = 'original-camera' | 'processed-output';
export type PictureInPictureAnchor =
  | 'bottom-left'
  | 'bottom-right'
  | 'top-left'
  | 'top-right';

export interface PictureInPictureConfig {
  readonly anchor: PictureInPictureAnchor;
  readonly enabled: boolean;
  readonly inset: number;
  readonly opacity: number;
  readonly showBorder: boolean;
  readonly size: number;
  readonly source: CompositorSecondarySource;
}

export interface TimelineCompositionVisualLayer {
  readonly blendMode: TimelineBlendMode;
  readonly clipId: string;
  readonly clipOffsetMs: number;
  readonly effects: readonly TimelineClipEffect[];
  readonly mediaType: TimelineClipSource['mediaType'];
  readonly opacity: number;
  readonly remainingMs: number;
  readonly sourceId: string;
  readonly sourceOffsetMs: number;
  readonly trackId: string;
  readonly trackIndex: number;
  readonly transform: TimelineClipTransform;
  readonly zIndex: number;
}

export interface TimelineCompositionTransition {
  readonly clipId: string;
  readonly curve: TimelineTransitionCurve;
  readonly durationMs: number;
  readonly placement: TimelineTransitionPlacement;
  readonly progress: number;
  readonly sourceA: string | null;
  readonly sourceAOffsetMs: number | null;
  readonly sourceB: string;
  readonly sourceBOffsetMs: number;
  readonly trackId: string;
  readonly transitionId: string;
  readonly type: TimelineTransitionType;
}

export interface TimelineCompositionMetadata {
  readonly audioContextTimeSeconds: number | null;
  readonly frameDurationMs: number;
  readonly isPlaying: boolean;
  readonly playheadMs: number;
}

export interface TimelineCompositionPolicy {
  readonly exportMode: boolean;
  readonly previewQualityScale: number;
}

export interface TimelineCompositionInstruction {
  readonly audioNodes: readonly TimelineAudioCompositionInstruction[];
  readonly layers: readonly TimelineCompositionVisualLayer[];
  readonly metadata: TimelineCompositionMetadata;
  readonly policy: TimelineCompositionPolicy;
  readonly transitions: readonly TimelineCompositionTransition[];
}

export const defaultPictureInPictureConfig: PictureInPictureConfig = {
  anchor: 'bottom-right',
  enabled: false,
  inset: 0.04,
  opacity: 1,
  showBorder: true,
  size: 0.26,
  source: 'original-camera',
};

export function getTopTimelineCompositionLayer(
  instruction: TimelineCompositionInstruction | null,
): TimelineCompositionVisualLayer | null {
  if (instruction === null || instruction.layers.length === 0) {
    return null;
  }

  return instruction.layers[instruction.layers.length - 1] ?? null;
}
