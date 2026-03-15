import type { VisionFaceLandmark, VisionFaceRegion } from '../types/vision';

function clampNormalized(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function createFaceRegionBounds(
  landmarks: readonly VisionFaceLandmark[],
): VisionFaceRegion['bounds'] | null {
  if (landmarks.length === 0) {
    return null;
  }

  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;

  landmarks.forEach((landmark: VisionFaceLandmark): void => {
    minX = Math.min(minX, landmark.x);
    maxX = Math.max(maxX, landmark.x);
    minY = Math.min(minY, landmark.y);
    maxY = Math.max(maxY, landmark.y);
  });

  return {
    center: {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
    },
    height: Math.max(0, maxY - minY),
    maxX,
    maxY,
    minX,
    minY,
    width: Math.max(0, maxX - minX),
  };
}

function createRelativeRegion(
  kind: VisionFaceRegion['kind'],
  bounds: {
    readonly minX: number;
    readonly maxX: number;
    readonly minY: number;
    readonly maxY: number;
  },
  confidence: number,
): VisionFaceRegion {
  return {
    bounds: {
      center: {
        x: (bounds.minX + bounds.maxX) / 2,
        y: (bounds.minY + bounds.maxY) / 2,
      },
      height: Math.max(0, bounds.maxY - bounds.minY),
      maxX: clampNormalized(bounds.maxX),
      maxY: clampNormalized(bounds.maxY),
      minX: clampNormalized(bounds.minX),
      minY: clampNormalized(bounds.minY),
      width: Math.max(0, bounds.maxX - bounds.minX),
    },
    confidence,
    kind,
  };
}

export function deriveFaceRegionsFromLandmarks(
  landmarks: readonly VisionFaceLandmark[],
): readonly VisionFaceRegion[] {
  const faceBounds = createFaceRegionBounds(landmarks);

  if (faceBounds === null) {
    return [];
  }

  const foreheadHeight = faceBounds.height * 0.22;
  const eyeBandTop = faceBounds.minY + faceBounds.height * 0.24;
  const eyeBandBottom = faceBounds.minY + faceBounds.height * 0.5;
  const underEyeTop = faceBounds.minY + faceBounds.height * 0.42;
  const underEyeBottom = faceBounds.minY + faceBounds.height * 0.63;
  const mouthTop = faceBounds.minY + faceBounds.height * 0.64;
  const mouthBottom = faceBounds.maxY;
  const midX = faceBounds.center.x;
  const eyeInsetX = faceBounds.width * 0.08;

  return [
    {
      bounds: faceBounds,
      confidence: 0.95,
      kind: 'face',
    },
    createRelativeRegion(
      'forehead',
      {
        maxX: faceBounds.maxX,
        maxY: faceBounds.minY + foreheadHeight,
        minX: faceBounds.minX,
        minY: faceBounds.minY,
      },
      0.72,
    ),
    createRelativeRegion(
      'left-eye',
      {
        maxX: midX - eyeInsetX,
        maxY: eyeBandBottom,
        minX: faceBounds.minX + eyeInsetX,
        minY: eyeBandTop,
      },
      0.7,
    ),
    createRelativeRegion(
      'right-eye',
      {
        maxX: faceBounds.maxX - eyeInsetX,
        maxY: eyeBandBottom,
        minX: midX + eyeInsetX,
        minY: eyeBandTop,
      },
      0.7,
    ),
    createRelativeRegion(
      'left-under-eye',
      {
        maxX: midX - eyeInsetX,
        maxY: underEyeBottom,
        minX: faceBounds.minX + eyeInsetX,
        minY: underEyeTop,
      },
      0.62,
    ),
    createRelativeRegion(
      'right-under-eye',
      {
        maxX: faceBounds.maxX - eyeInsetX,
        maxY: underEyeBottom,
        minX: midX + eyeInsetX,
        minY: underEyeTop,
      },
      0.62,
    ),
    createRelativeRegion(
      'mouth',
      {
        maxX: faceBounds.maxX - faceBounds.width * 0.18,
        maxY: mouthBottom,
        minX: faceBounds.minX + faceBounds.width * 0.18,
        minY: mouthTop,
      },
      0.68,
    ),
  ];
}
