import { describe, expect, it } from 'vitest';
import { AIDiagnosticsService } from '../AIDiagnosticsService';

describe('AIDiagnosticsService', (): void => {
  it('tracks submits, successes, and worker errors', (): void => {
    const service = new AIDiagnosticsService();

    service.recordSubmit(100);
    service.recordSuccess(12, 112);
    service.recordWorkerError();
    const snapshot = service.getSnapshot();

    expect(snapshot.submittedFrameCount).toBe(1);
    expect(snapshot.processedFrameCount).toBe(1);
    expect(snapshot.averageProcessingDurationMs).toBe(12);
    expect(snapshot.consecutiveWorkerErrors).toBe(1);
    expect(snapshot.workerErrorCount).toBe(1);
  });

  it('resets counters back to the initial snapshot', (): void => {
    const service = new AIDiagnosticsService();

    service.recordBusyDrop();
    service.recordCadenceSkip();
    service.recordDuplicateSkip();
    service.recordHiddenSkip();
    service.recordNotReadySkip();

    const snapshot = service.reset();

    expect(snapshot.droppedBusyFrames).toBe(0);
    expect(snapshot.skippedCadenceFrames).toBe(0);
    expect(snapshot.skippedDuplicateFrames).toBe(0);
    expect(snapshot.skippedHiddenFrames).toBe(0);
    expect(snapshot.skippedNotReadyFrames).toBe(0);
  });
});
