import { describe, expect, it } from 'vitest';
import { determineVisionFrameExecutionDecision } from '../VisionWorkerRuntime';

describe('determineVisionFrameExecutionDecision', (): void => {
  it('skips frames while model synchronization is in progress', (): void => {
    expect(
      determineVisionFrameExecutionDecision({
        activeFeatures: {
          backgroundBlur: true,
          faceTracking: false,
        },
        hasFaceLandmarker: false,
        hasImageSegmenter: false,
        isModelSyncInProgress: true,
      }),
    ).toEqual({
      kind: 'skip',
      reason: 'models-not-ready',
    });
  });

  it('skips frames when an enabled model is unavailable', (): void => {
    expect(
      determineVisionFrameExecutionDecision({
        activeFeatures: {
          backgroundBlur: false,
          faceTracking: true,
        },
        hasFaceLandmarker: false,
        hasImageSegmenter: true,
        isModelSyncInProgress: false,
      }),
    ).toEqual({
      kind: 'skip',
      reason: 'models-not-ready',
    });
  });

  it('returns empty results when no features are active', (): void => {
    expect(
      determineVisionFrameExecutionDecision({
        activeFeatures: {
          backgroundBlur: false,
          faceTracking: false,
        },
        hasFaceLandmarker: false,
        hasImageSegmenter: false,
        isModelSyncInProgress: false,
      }),
    ).toEqual({
      kind: 'empty-results',
    });
  });

  it('allows frame processing when required models are ready', (): void => {
    expect(
      determineVisionFrameExecutionDecision({
        activeFeatures: {
          backgroundBlur: true,
          faceTracking: true,
        },
        hasFaceLandmarker: true,
        hasImageSegmenter: true,
        isModelSyncInProgress: false,
      }),
    ).toEqual({
      kind: 'process',
    });
  });

  it('remains on the skip path for repeated init-time frames without escalating to errors', (): void => {
    const repeatedDecisions = Array.from({ length: 1000 }, () =>
      determineVisionFrameExecutionDecision({
        activeFeatures: {
          backgroundBlur: true,
          faceTracking: true,
        },
        hasFaceLandmarker: false,
        hasImageSegmenter: false,
        isModelSyncInProgress: true,
      }),
    );

    expect(
      repeatedDecisions.every(
        (decision): boolean =>
          decision.kind === 'skip' && decision.reason === 'models-not-ready',
      ),
    ).toBe(true);
  });
});
