import type { VisionRuntimeDiagnostics } from '../types/vision';

const initialDiagnostics: VisionRuntimeDiagnostics = {
  averageProcessingDurationMs: 0,
  consecutiveWorkerErrors: 0,
  droppedBusyFrames: 0,
  lastCompletedAtMs: null,
  lastProcessingDurationMs: null,
  lastSubmittedAtMs: null,
  processedFrameCount: 0,
  skippedCadenceFrames: 0,
  skippedDuplicateFrames: 0,
  skippedHiddenFrames: 0,
  skippedNotReadyFrames: 0,
  submittedFrameCount: 0,
  workerErrorCount: 0,
};

export class AIDiagnosticsService {
  private diagnostics: VisionRuntimeDiagnostics = initialDiagnostics;

  getSnapshot(): VisionRuntimeDiagnostics {
    return this.diagnostics;
  }

  recordBusyDrop(): VisionRuntimeDiagnostics {
    this.diagnostics = {
      ...this.diagnostics,
      droppedBusyFrames: this.diagnostics.droppedBusyFrames + 1,
    };

    return this.diagnostics;
  }

  recordCadenceSkip(): VisionRuntimeDiagnostics {
    this.diagnostics = {
      ...this.diagnostics,
      skippedCadenceFrames: this.diagnostics.skippedCadenceFrames + 1,
    };

    return this.diagnostics;
  }

  recordDuplicateSkip(): VisionRuntimeDiagnostics {
    this.diagnostics = {
      ...this.diagnostics,
      skippedDuplicateFrames: this.diagnostics.skippedDuplicateFrames + 1,
    };

    return this.diagnostics;
  }

  recordHiddenSkip(): VisionRuntimeDiagnostics {
    this.diagnostics = {
      ...this.diagnostics,
      skippedHiddenFrames: this.diagnostics.skippedHiddenFrames + 1,
    };

    return this.diagnostics;
  }

  recordNotReadySkip(): VisionRuntimeDiagnostics {
    this.diagnostics = {
      ...this.diagnostics,
      skippedNotReadyFrames: this.diagnostics.skippedNotReadyFrames + 1,
    };

    return this.diagnostics;
  }

  recordSubmit(timestampMs: number): VisionRuntimeDiagnostics {
    this.diagnostics = {
      ...this.diagnostics,
      lastSubmittedAtMs: timestampMs,
      submittedFrameCount: this.diagnostics.submittedFrameCount + 1,
    };

    return this.diagnostics;
  }

  recordSuccess(processingDurationMs: number, completedAtMs: number): VisionRuntimeDiagnostics {
    const processedFrameCount = this.diagnostics.processedFrameCount + 1;
    const nextAverage =
      (this.diagnostics.averageProcessingDurationMs * this.diagnostics.processedFrameCount +
        processingDurationMs) /
      processedFrameCount;

    this.diagnostics = {
      ...this.diagnostics,
      averageProcessingDurationMs: nextAverage,
      consecutiveWorkerErrors: 0,
      lastCompletedAtMs: completedAtMs,
      lastProcessingDurationMs: processingDurationMs,
      processedFrameCount,
    };

    return this.diagnostics;
  }

  recordWorkerError(): VisionRuntimeDiagnostics {
    this.diagnostics = {
      ...this.diagnostics,
      consecutiveWorkerErrors: this.diagnostics.consecutiveWorkerErrors + 1,
      workerErrorCount: this.diagnostics.workerErrorCount + 1,
    };

    return this.diagnostics;
  }

  reset(): VisionRuntimeDiagnostics {
    this.diagnostics = initialDiagnostics;
    return this.diagnostics;
  }
}
