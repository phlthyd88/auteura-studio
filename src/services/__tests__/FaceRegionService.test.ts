import { describe, expect, it } from 'vitest';
import { createFaceRegionBounds, deriveFaceRegionsFromLandmarks } from '../FaceRegionService';
import type { VisionFaceLandmark } from '../../types/vision';

const landmarks: readonly VisionFaceLandmark[] = [
  { visibility: 1, x: 0.32, y: 0.18, z: 0 },
  { visibility: 1, x: 0.68, y: 0.2, z: 0 },
  { visibility: 1, x: 0.38, y: 0.76, z: 0 },
  { visibility: 1, x: 0.62, y: 0.72, z: 0 },
];

describe('FaceRegionService', (): void => {
  it('derives normalized face bounds from landmarks', (): void => {
    const bounds = createFaceRegionBounds(landmarks);

    expect(bounds).not.toBeNull();
    expect(bounds?.minX).toBeCloseTo(0.32, 5);
    expect(bounds?.maxX).toBeCloseTo(0.68, 5);
    expect(bounds?.minY).toBeCloseTo(0.18, 5);
    expect(bounds?.maxY).toBeCloseTo(0.76, 5);
    expect(bounds?.center.x).toBeCloseTo(0.5, 5);
    expect(bounds?.center.y).toBeCloseTo(0.47, 5);
  });

  it('creates a stable set of portrait regions from landmarks', (): void => {
    const regions = deriveFaceRegionsFromLandmarks(landmarks);

    expect(regions.map((region) => region.kind)).toEqual([
      'face',
      'forehead',
      'left-eye',
      'right-eye',
      'left-under-eye',
      'right-under-eye',
      'mouth',
    ]);
    expect(regions.every((region) => region.bounds.minX >= 0 && region.bounds.maxX <= 1)).toBe(true);
    expect(regions.every((region) => region.bounds.minY >= 0 && region.bounds.maxY <= 1)).toBe(true);
    expect(regions[0]?.confidence).toBeGreaterThan(regions[5]?.confidence ?? 0);
  });
});
