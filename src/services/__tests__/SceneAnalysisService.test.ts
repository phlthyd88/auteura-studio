import { describe, expect, it } from 'vitest';
import { analyzeSceneFromScope } from '../SceneAnalysisService';
import type { ScopeAnalysisData } from '../../engine/ScopeAnalyzer';
import type { VisionInferenceResults } from '../../types/vision';

function createScopeData(input: Partial<ScopeAnalysisData>): ScopeAnalysisData {
  return {
    histogram: Array.from({ length: 64 }, (): number => 0),
    rgbParade: {
      blue: Array.from({ length: 48 }, (): number => 0.5),
      green: Array.from({ length: 48 }, (): number => 0.5),
      red: Array.from({ length: 48 }, (): number => 0.5),
    },
    vectorscopePoints: [],
    ...input,
  };
}

function createResults(): VisionInferenceResults {
  return {
    faces: [
      {
        blendshapes: [],
        landmarks: [
          { visibility: 1, x: 0.76, y: 0.05, z: 0 },
          { visibility: 1, x: 0.84, y: 0.1, z: 0 },
          { visibility: 1, x: 0.8, y: 0.22, z: 0 },
        ],
        regions: [
          {
            bounds: {
              center: { x: 0.8, y: 0.135 },
              height: 0.17,
              maxX: 0.84,
              maxY: 0.22,
              minX: 0.76,
              minY: 0.05,
              width: 0.08,
            },
            confidence: 0.95,
            kind: 'face',
          },
        ],
        transformationMatrix: null,
      },
    ],
    processingDurationMs: 12,
    requestId: 1,
    segmentationMask: null,
    timestamp: Date.now(),
  };
}

describe('analyzeSceneFromScope', (): void => {
  it('produces exposure and white-balance guidance from scope data', (): void => {
    const histogram = Array.from({ length: 64 }, (_value, index): number =>
      index < 4 ? 0.08 : 0.002,
    );
    const total = histogram.reduce((sum: number, bin: number): number => sum + bin, 0);
    const normalizedHistogram = histogram.map((bin: number): number => bin / total);
    const analysis = analyzeSceneFromScope(
      createScopeData({
        histogram: normalizedHistogram,
        rgbParade: {
          blue: Array.from({ length: 48 }, (): number => 0.28),
          green: Array.from({ length: 48 }, (): number => 0.44),
          red: Array.from({ length: 48 }, (): number => 0.67),
        },
      }),
      {
        cameraSettings: null,
        results: null,
      },
    );

    expect(analysis.status).toBe('ready');
    expect(analysis.insights.some((insight): boolean => insight.id === 'exposure-under')).toBe(true);
    expect(analysis.insights.some((insight): boolean => insight.id === 'white-balance-warm')).toBe(true);
  });

  it('produces framing and headroom guidance from face landmarks', (): void => {
    const histogram = Array.from({ length: 64 }, (): number => 1 / 64);
    const analysis = analyzeSceneFromScope(
      createScopeData({
        histogram,
      }),
      {
        cameraSettings: null,
        results: createResults(),
      },
    );

    expect(analysis.insights.some((insight): boolean => insight.id === 'framing-shift-left')).toBe(true);
    expect(analysis.insights.some((insight): boolean => insight.id === 'headroom-tight')).toBe(true);
  });

  it('produces zoom guidance when the subject is too small in frame', (): void => {
    const histogram = Array.from({ length: 64 }, (): number => 1 / 64);
    const results = createResults();
    const face = results.faces[0];

    if (face === undefined) {
      throw new Error('Expected a face fixture.');
    }

    const analysis = analyzeSceneFromScope(
      createScopeData({ histogram }),
      {
        cameraSettings: null,
        results: {
          ...results,
          faces: [
            {
              ...face,
              regions: [
                {
                  bounds: {
                    center: { x: 0.5, y: 0.42 },
                    height: 0.2,
                    maxX: 0.57,
                    maxY: 0.52,
                    minX: 0.43,
                    minY: 0.32,
                    width: 0.14,
                  },
                  confidence: 0.95,
                  kind: 'face',
                },
              ],
            },
          ],
        },
      },
    );

    expect(analysis.insights.some((insight): boolean => insight.id === 'framing-zoom-in')).toBe(true);
  });

  it('produces loose-headroom guidance when the subject sits too low', (): void => {
    const histogram = Array.from({ length: 64 }, (): number => 1 / 64);
    const results = createResults();
    const face = results.faces[0];

    if (face === undefined) {
      throw new Error('Expected a face fixture.');
    }

    const analysis = analyzeSceneFromScope(
      createScopeData({ histogram }),
      {
        cameraSettings: null,
        results: {
          ...results,
          faces: [
            {
              ...face,
              regions: [
                {
                  bounds: {
                    center: { x: 0.5, y: 0.5 },
                    height: 0.22,
                    maxX: 0.62,
                    maxY: 0.61,
                    minX: 0.38,
                    minY: 0.28,
                    width: 0.24,
                  },
                  confidence: 0.95,
                  kind: 'face',
                },
              ],
            },
          ],
        },
      },
    );

    expect(analysis.insights.some((insight): boolean => insight.id === 'headroom-loose')).toBe(true);
  });

  it('prefers normalized face regions over raw landmark traversal when available', (): void => {
    const histogram = Array.from({ length: 64 }, (): number => 1 / 64);
    const results = createResults();
    const face = results.faces[0];

    if (face === undefined) {
      throw new Error('Expected a face fixture.');
    }

    const analysis = analyzeSceneFromScope(
      createScopeData({ histogram }),
      {
        cameraSettings: null,
        results: {
          ...results,
          faces: [
            {
              ...face,
              landmarks: [],
            },
          ],
        },
      },
    );

    expect(analysis.stats?.framingOffsetX).not.toBeNull();
    expect(analysis.stats?.headroomRatio).toBe(0.05);
  });
});
