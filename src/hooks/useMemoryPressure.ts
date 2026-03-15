import { useEffect, useState } from 'react';

export interface MemoryPressureSnapshot {
  readonly heapUsageRatio: number | null;
  readonly isMemoryConstrained: boolean;
}

function readMemoryPressure(): MemoryPressureSnapshot {
  const performanceWithMemory = performance as Performance & {
    readonly memory?: {
      readonly jsHeapSizeLimit: number;
      readonly usedJSHeapSize: number;
    } | null;
  };

  if (
    typeof performance === 'undefined' ||
    performanceWithMemory.memory === undefined ||
    performanceWithMemory.memory === null
  ) {
    return {
      heapUsageRatio: null,
      isMemoryConstrained: false,
    };
  }

  const jsHeapSizeLimit = performanceWithMemory.memory.jsHeapSizeLimit;
  const usedJSHeapSize = performanceWithMemory.memory.usedJSHeapSize;

  if (jsHeapSizeLimit <= 0) {
    return {
      heapUsageRatio: null,
      isMemoryConstrained: false,
    };
  }

  const heapUsageRatio = usedJSHeapSize / jsHeapSizeLimit;

  return {
    heapUsageRatio,
    isMemoryConstrained: heapUsageRatio >= 0.78,
  };
}

export function useMemoryPressure(sampleIntervalMs = 5000): MemoryPressureSnapshot {
  const [snapshot, setSnapshot] = useState<MemoryPressureSnapshot>(() => readMemoryPressure());

  useEffect((): (() => void) => {
    const intervalId = window.setInterval((): void => {
      setSnapshot(readMemoryPressure());
    }, sampleIntervalMs);

    return (): void => {
      window.clearInterval(intervalId);
    };
  }, [sampleIntervalMs]);

  return snapshot;
}
