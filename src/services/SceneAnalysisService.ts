import {
  ScopeAnalyzer,
  analyzeImageData,
  emptyScopeAnalysis,
  type ScopeAnalysisData,
} from '../engine/ScopeAnalyzer';
import type { CameraFormatSettings } from './CameraCapabilityService';
import type { VisionInferenceResults } from '../types/vision';

export type SceneInsightCategory =
  | 'exposure'
  | 'white-balance'
  | 'framing'
  | 'headroom'
  | 'subject-presence';

export type SceneInsightSeverity = 'info' | 'warning';

export interface SceneInsight {
  readonly category: SceneInsightCategory;
  readonly confidence: number;
  readonly description: string;
  readonly id: string;
  readonly severity: SceneInsightSeverity;
  readonly title: string;
}

export interface SceneAnalysisStats {
  readonly averageLuma: number;
  readonly faceCount: number;
  readonly faceHeightRatio: number | null;
  readonly faceWidthRatio: number | null;
  readonly framingOffsetX: number | null;
  readonly framingOffsetY: number | null;
  readonly hasSegmentationMask: boolean;
  readonly headroomRatio: number | null;
  readonly highlightClipping: number;
  readonly shadowClipping: number;
  readonly subjectCoverage: number | null;
  readonly warmthBias: number;
}

export interface SceneAnalysisSnapshot {
  readonly insights: readonly SceneInsight[];
  readonly scope: ScopeAnalysisData;
  readonly stats: SceneAnalysisStats | null;
  readonly status: 'idle' | 'ready' | 'unavailable';
  readonly timestamp: number | null;
}

export interface SceneAnalysisInput {
  readonly cameraSettings: CameraFormatSettings | null;
  readonly results: VisionInferenceResults | null;
  readonly timestampMs: number;
}

export const emptySceneAnalysis: SceneAnalysisSnapshot = {
  insights: [],
  scope: emptyScopeAnalysis,
  stats: null,
  status: 'idle',
  timestamp: null,
};

function average(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum: number, value: number): number => sum + value, 0) / values.length;
}

function clampConfidence(value: number): number {
  return Math.max(0.2, Math.min(0.99, value));
}

function summarizeSubjectCoverage(maskData: Uint8Array): number | null {
  if (maskData.length === 0) {
    return null;
  }

  let foregroundCount = 0;

  maskData.forEach((sample: number): void => {
    if (sample > 0) {
      foregroundCount += 1;
    }
  });

  return foregroundCount / maskData.length;
}

function getFaceBounds(results: VisionInferenceResults | null): {
  readonly centerX: number;
  readonly centerY: number;
  readonly height: number;
  readonly minY: number;
  readonly width: number;
} | null {
  const face = results?.faces[0];

  if (face === undefined) {
    return null;
  }

  const faceRegion = face.regions.find((region): boolean => region.kind === 'face');

  if (faceRegion !== undefined) {
    return {
      centerX: faceRegion.bounds.center.x,
      centerY: faceRegion.bounds.center.y,
      height: faceRegion.bounds.height,
      minY: faceRegion.bounds.minY,
      width: faceRegion.bounds.width,
    };
  }

  if (face.landmarks.length === 0) {
    return null;
  }

  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;

  face.landmarks.forEach((landmark): void => {
    minX = Math.min(minX, landmark.x);
    maxX = Math.max(maxX, landmark.x);
    minY = Math.min(minY, landmark.y);
    maxY = Math.max(maxY, landmark.y);
  });

  return {
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    height: Math.max(0, maxY - minY),
    minY,
    width: Math.max(0, maxX - minX),
  };
}

export function analyzeSceneFromScope(
  scope: ScopeAnalysisData,
  input: Omit<SceneAnalysisInput, 'timestampMs'>,
): SceneAnalysisSnapshot {
  const averageLuma = scope.histogram.reduce(
    (sum: number, bin: number, index: number): number =>
      sum + bin * (index / Math.max(1, scope.histogram.length - 1)),
    0,
  );
  const shadowClipping = scope.histogram.slice(0, 3).reduce(
    (sum: number, bin: number): number => sum + bin,
    0,
  );
  const highlightClipping = scope.histogram.slice(-3).reduce(
    (sum: number, bin: number): number => sum + bin,
    0,
  );
  const redAverage = average(scope.rgbParade.red);
  const blueAverage = average(scope.rgbParade.blue);
  const warmthBias = redAverage - blueAverage;
  const faceBounds = getFaceBounds(input.results);
  const framingOffsetX = faceBounds === null ? null : faceBounds.centerX - 0.5;
  const framingOffsetY = faceBounds === null ? null : faceBounds.centerY - 0.5;
  const subjectCoverage =
    input.results?.segmentationMask === null || input.results === null
      ? null
      : summarizeSubjectCoverage(input.results.segmentationMask.data);
  const stats: SceneAnalysisStats = {
    averageLuma,
    faceCount: input.results?.faces.length ?? 0,
    faceHeightRatio: faceBounds?.height ?? null,
    faceWidthRatio: faceBounds?.width ?? null,
    framingOffsetX,
    framingOffsetY,
    hasSegmentationMask: input.results?.segmentationMask !== null && input.results !== null,
    headroomRatio: faceBounds?.minY ?? null,
    highlightClipping,
    shadowClipping,
    subjectCoverage,
    warmthBias,
  };
  const insights: SceneInsight[] = [];

  if (averageLuma < 0.34 || shadowClipping > 0.17) {
    insights.push({
      category: 'exposure',
      confidence: clampConfidence(Math.max(0.35 - averageLuma, shadowClipping) * 2.3),
      description: 'Lift exposure or add fill light to recover shadow detail.',
      id: 'exposure-under',
      severity: 'warning',
      title: 'Scene appears underexposed',
    });
  } else if (averageLuma > 0.71 || highlightClipping > 0.13) {
    insights.push({
      category: 'exposure',
      confidence: clampConfidence(Math.max(averageLuma - 0.71, highlightClipping) * 2),
      description: 'Reduce exposure or soften highlights to protect bright detail.',
      id: 'exposure-over',
      severity: 'warning',
      title: 'Highlights are nearing clip',
    });
  }

  if (warmthBias > 0.08) {
    insights.push({
      category: 'white-balance',
      confidence: clampConfidence(Math.abs(warmthBias) * 3),
      description: 'Cool the white balance slightly to neutralize warm cast.',
      id: 'white-balance-warm',
      severity: 'info',
      title: 'Image trends warm',
    });
  } else if (warmthBias < -0.08) {
    insights.push({
      category: 'white-balance',
      confidence: clampConfidence(Math.abs(warmthBias) * 3),
      description: 'Warm the white balance slightly to reduce the cool cast.',
      id: 'white-balance-cool',
      severity: 'info',
      title: 'Image trends cool',
    });
  }

  if (framingOffsetX !== null && Math.abs(framingOffsetX) > 0.12) {
    insights.push({
      category: 'framing',
      confidence: clampConfidence(Math.abs(framingOffsetX) * 3),
      description:
        framingOffsetX > 0
          ? 'Shift the subject left for a more centered frame.'
          : 'Shift the subject right for a more centered frame.',
      id: framingOffsetX > 0 ? 'framing-shift-left' : 'framing-shift-right',
      severity: 'info',
      title: 'Subject is off center',
    });
  }

  if (framingOffsetY !== null && Math.abs(framingOffsetY) > 0.12) {
    insights.push({
      category: 'framing',
      confidence: clampConfidence(Math.abs(framingOffsetY) * 3),
      description:
        framingOffsetY > 0
          ? 'Raise the framing slightly so the subject sits higher in the shot.'
          : 'Lower the framing slightly to avoid crowding the top edge.',
      id: framingOffsetY > 0 ? 'framing-raise-subject' : 'framing-lower-subject',
      severity: 'info',
      title: 'Vertical framing can be improved',
    });
  }

  if (
    stats.faceWidthRatio !== null &&
    stats.faceHeightRatio !== null &&
    stats.faceWidthRatio < 0.18 &&
    stats.faceHeightRatio < 0.26
  ) {
    insights.push({
      category: 'framing',
      confidence: clampConfidence((0.2 - stats.faceWidthRatio) * 3.2),
      description: 'Move in slightly so the subject has more presence in frame.',
      id: 'framing-zoom-in',
      severity: 'info',
      title: 'Subject appears distant',
    });
  } else if (
    stats.faceWidthRatio !== null &&
    stats.faceHeightRatio !== null &&
    (stats.faceWidthRatio > 0.42 || stats.faceHeightRatio > 0.58)
  ) {
    insights.push({
      category: 'framing',
      confidence: clampConfidence(Math.max(stats.faceWidthRatio - 0.42, stats.faceHeightRatio - 0.58) * 3),
      description: 'Pull back slightly to give the subject more breathing room.',
      id: 'framing-zoom-out',
      severity: 'info',
      title: 'Framing feels tight',
    });
  }

  if (stats.headroomRatio !== null && stats.headroomRatio < 0.08) {
    insights.push({
      category: 'headroom',
      confidence: clampConfidence((0.08 - stats.headroomRatio) * 8),
      description: 'Increase headroom slightly so the frame feels less constrained.',
      id: 'headroom-tight',
      severity: 'info',
      title: 'Headroom is tight',
    });
  } else if (stats.headroomRatio !== null && stats.headroomRatio > 0.22) {
    insights.push({
      category: 'headroom',
      confidence: clampConfidence((stats.headroomRatio - 0.22) * 4),
      description: 'Reduce headroom slightly so the subject carries more visual weight.',
      id: 'headroom-loose',
      severity: 'info',
      title: 'Headroom feels generous',
    });
  }

  if (stats.faceCount === 0 && (subjectCoverage ?? 0) < 0.08) {
    insights.push({
      category: 'subject-presence',
      confidence: 0.62,
      description: 'Frame a clearer subject or enable face tracking for guided composition.',
      id: 'subject-presence-low',
      severity: 'info',
      title: 'No clear subject detected',
    });
  }

  return {
    insights: insights.sort((left, right): number => right.confidence - left.confidence).slice(0, 4),
    scope,
    stats,
    status: 'ready',
    timestamp: null,
  };
}

export class SceneAnalysisService {
  private readonly analyzer: ScopeAnalyzer;

  public constructor(
    sampleWidth: number,
    sampleHeight: number,
  ) {
    this.analyzer = new ScopeAnalyzer(sampleWidth, sampleHeight);
  }

  public analyzeCanvas(
    sourceCanvas: HTMLCanvasElement,
    input: SceneAnalysisInput,
  ): SceneAnalysisSnapshot {
    if (sourceCanvas.width === 0 || sourceCanvas.height === 0) {
      return emptySceneAnalysis;
    }

    const scope = this.analyzer.analyzeCanvas(sourceCanvas);
    const analysis = analyzeSceneFromScope(scope, input);

    return {
      ...analysis,
      timestamp: input.timestampMs,
    };
  }

  public analyzeImageData(
    imageData: ImageData,
    input: SceneAnalysisInput,
  ): SceneAnalysisSnapshot {
    const scope = analyzeImageData(imageData);
    const analysis = analyzeSceneFromScope(scope, input);

    return {
      ...analysis,
      timestamp: input.timestampMs,
    };
  }
}
