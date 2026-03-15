import { describe, expect, it } from 'vitest';
import {
  resolveOfflineAudioChunkRanges,
  resolveExportFrameCount,
  resolveExportFrameElapsedMs,
} from '../TimelineExportService';

describe('TimelineExportService frame planning', (): void => {
  it('includes both the opening and final frame in deterministic export plans', (): void => {
    expect(resolveExportFrameCount(1000, 30)).toBe(31);
    expect(resolveExportFrameCount(0, 30)).toBe(1);
  });

  it('clamps exported frame timestamps to the project duration', (): void => {
    expect(resolveExportFrameElapsedMs(0, 1000, 30)).toBe(0);
    expect(resolveExportFrameElapsedMs(15, 1000, 30)).toBeCloseTo(500, 5);
    expect(resolveExportFrameElapsedMs(30, 1000, 30)).toBe(1000);
    expect(resolveExportFrameElapsedMs(31, 1000, 30)).toBe(1000);
  });

  it('splits offline audio rendering into bounded chunk ranges', (): void => {
    expect(resolveOfflineAudioChunkRanges(25_001)).toEqual([
      { durationMs: 10_000, startMs: 0 },
      { durationMs: 10_000, startMs: 10_000 },
      { durationMs: 5_001, startMs: 20_000 },
    ]);
  });
});
