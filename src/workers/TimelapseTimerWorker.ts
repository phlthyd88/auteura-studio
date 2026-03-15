/// <reference lib="webworker" />

type TimelapseWorkerMessage =
  | {
      readonly type: 'START';
      readonly intervalMs: number;
    }
  | {
      readonly type: 'PAUSE';
    }
  | {
      readonly type: 'RESUME';
    }
  | {
      readonly type: 'STOP';
    };

const workerScope: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;

let activeIntervalMs = 0;
let timeoutId: number | null = null;
let isRunning = false;

function clearScheduledTick(): void {
  if (timeoutId !== null) {
    workerScope.clearTimeout(timeoutId);
    timeoutId = null;
  }
}

function scheduleNextTick(): void {
  clearScheduledTick();

  if (!isRunning || activeIntervalMs <= 0) {
    return;
  }

  timeoutId = workerScope.setTimeout((): void => {
    timeoutId = null;

    if (!isRunning) {
      return;
    }

    workerScope.postMessage({
      type: 'TICK',
    });
    scheduleNextTick();
  }, activeIntervalMs);
}

workerScope.onmessage = (event: MessageEvent<TimelapseWorkerMessage>): void => {
  const message = event.data;

  switch (message.type) {
    case 'START':
      activeIntervalMs = Math.max(250, Math.floor(message.intervalMs));
      isRunning = true;
      scheduleNextTick();
      break;
    case 'PAUSE':
      isRunning = false;
      clearScheduledTick();
      break;
    case 'RESUME':
      if (activeIntervalMs <= 0) {
        return;
      }

      isRunning = true;
      scheduleNextTick();
      break;
    case 'STOP':
      isRunning = false;
      activeIntervalMs = 0;
      clearScheduledTick();
      break;
    default:
      break;
  }
};
