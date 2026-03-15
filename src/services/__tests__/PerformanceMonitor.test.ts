import { describe, expect, it } from 'vitest';
import { PerformanceMonitor } from '../PerformanceMonitor';

describe('PerformanceMonitor', (): void => {
  it('computes average fps and long frame ratio from frame samples', (): void => {
    const monitor = new PerformanceMonitor();

    monitor.recordFrame(0);
    monitor.recordFrame(16);
    monitor.recordFrame(33);
    monitor.recordFrame(75);

    const snapshot = monitor.getSnapshot();

    expect(snapshot.sampleCount).toBe(3);
    expect(snapshot.averageFrameTimeMs).toBeCloseTo((16 + 17 + 42) / 3, 5);
    expect(snapshot.averageFps).toBeGreaterThan(0);
    expect(snapshot.longFrameRatio).toBeCloseTo(1 / 3, 5);
  });

  it('resets all collected frame metrics', (): void => {
    const monitor = new PerformanceMonitor();

    monitor.recordFrame(0);
    monitor.recordFrame(20);

    const snapshot = monitor.reset();

    expect(snapshot.sampleCount).toBe(0);
    expect(snapshot.averageFps).toBe(0);
    expect(snapshot.longFrameRatio).toBe(0);
  });
});
