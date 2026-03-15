export interface PerformanceMonitorSnapshot {
  readonly averageFps: number;
  readonly averageFrameTimeMs: number;
  readonly longFrameRatio: number;
  readonly sampleCount: number;
}

const maxSamples = 120;

export class PerformanceMonitor {
  private readonly frameDeltas: number[] = [];

  private lastTimestamp: number | null = null;

  private longFrameCount = 0;

  getSnapshot(): PerformanceMonitorSnapshot {
    if (this.frameDeltas.length === 0) {
      return {
        averageFps: 0,
        averageFrameTimeMs: 0,
        longFrameRatio: 0,
        sampleCount: 0,
      };
    }

    const totalFrameTimeMs = this.frameDeltas.reduce(
      (runningTotal: number, delta: number): number => runningTotal + delta,
      0,
    );
    const averageFrameTimeMs = totalFrameTimeMs / this.frameDeltas.length;

    return {
      averageFps: averageFrameTimeMs <= 0 ? 0 : 1000 / averageFrameTimeMs,
      averageFrameTimeMs,
      longFrameRatio: this.longFrameCount / this.frameDeltas.length,
      sampleCount: this.frameDeltas.length,
    };
  }

  recordFrame(timestampMs: number): PerformanceMonitorSnapshot {
    if (this.lastTimestamp !== null) {
      const deltaMs = timestampMs - this.lastTimestamp;

      if (Number.isFinite(deltaMs) && deltaMs > 0) {
        this.frameDeltas.push(deltaMs);

        if (deltaMs >= 34) {
          this.longFrameCount += 1;
        }

        if (this.frameDeltas.length > maxSamples) {
          const removedDelta = this.frameDeltas.shift();

          if (removedDelta !== undefined && removedDelta >= 34) {
            this.longFrameCount = Math.max(0, this.longFrameCount - 1);
          }
        }
      }
    }

    this.lastTimestamp = timestampMs;
    return this.getSnapshot();
  }

  reset(): PerformanceMonitorSnapshot {
    this.frameDeltas.length = 0;
    this.lastTimestamp = null;
    this.longFrameCount = 0;
    return this.getSnapshot();
  }
}
