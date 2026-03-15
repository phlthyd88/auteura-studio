import type { VisionEnabledFeatures } from '../types/vision';

export type VisionFrameExecutionDecision =
  | {
      readonly kind: 'empty-results';
    }
  | {
      readonly kind: 'process';
    }
  | {
      readonly kind: 'skip';
      readonly reason: 'models-not-ready';
    };

export function determineVisionFrameExecutionDecision(input: {
  readonly activeFeatures: VisionEnabledFeatures;
  readonly hasFaceLandmarker: boolean;
  readonly hasImageSegmenter: boolean;
  readonly isModelSyncInProgress: boolean;
}): VisionFrameExecutionDecision {
  const { activeFeatures, hasFaceLandmarker, hasImageSegmenter, isModelSyncInProgress } = input;

  if (!activeFeatures.faceTracking && !activeFeatures.backgroundBlur) {
    return {
      kind: 'empty-results',
    };
  }

  if (
    isModelSyncInProgress ||
    (activeFeatures.faceTracking && !hasFaceLandmarker) ||
    (activeFeatures.backgroundBlur && !hasImageSegmenter)
  ) {
    return {
      kind: 'skip',
      reason: 'models-not-ready',
    };
  }

  return {
    kind: 'process',
  };
}
