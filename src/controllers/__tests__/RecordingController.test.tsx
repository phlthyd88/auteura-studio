// @vitest-environment jsdom

import { act, render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RecordingController,
  type TimelapseSessionState,
  useRecordingController,
} from '../RecordingController';
import type { ImportedMediaCapability } from '../../types/importedMedia';
import type { MediaItem, MediaStorageStats } from '../../services/MediaStorageService';

interface RecordingSnapshot {
  readonly isProcessingCapture: boolean;
  readonly isTimelapseCapturing: boolean;
  readonly mediaCount: number;
  readonly timelapseShotsCaptured: number;
  readonly timelapseState: TimelapseSessionState;
}

interface RecordingActions {
  readonly startTimelapseCapture: () => Promise<void>;
  readonly stopTimelapseCapture: () => void;
}

interface DeferredPromise<T> {
  readonly promise: Promise<T>;
  reject: (reason?: unknown) => void;
  resolve: (value: T | PromiseLike<T>) => void;
}

function createDeferredPromise<T>(): DeferredPromise<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject): void => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

const mockedState = vi.hoisted(() => {
  const workerInstances: Array<{
    onmessage: ((event: MessageEvent<{ readonly type: 'TICK' }>) => void) | null;
    readonly postMessage: ReturnType<typeof vi.fn>;
    readonly terminate: ReturnType<typeof vi.fn>;
  }> = [];

  class MockTimelapseWorker {
    onmessage: ((event: MessageEvent<{ readonly type: 'TICK' }>) => void) | null = null;

    postMessage = vi.fn();

    terminate = vi.fn();

    constructor() {
      workerInstances.push(this);
    }
  }

  return {
    MockTimelapseWorker,
    canvasRef: { current: null as HTMLCanvasElement | null },
    mediaItems: [] as MediaItem[],
    saveMediaDeferred: null as DeferredPromise<void> | null,
    workerInstances,
  };
});

function createStorageStats(itemCount: number): MediaStorageStats {
  return {
    copiedItemCount: itemCount,
    handleBackedItemCount: 0,
    itemCount,
    maxAllowedBytes: 256 * 1024 * 1024,
    quotaBytes: 512 * 1024 * 1024,
    referencedBytes: 0,
    usageBytes: itemCount * 1024,
  };
}

function createImportedMediaCapability(): ImportedMediaCapability {
  return {
    fileSystemAccessSupported: false,
    preferredStrategy: 'copied-indexeddb',
  };
}

function RecordingHarness(
  {
    onActions,
    onSnapshot,
  }: {
    readonly onActions: (actions: RecordingActions) => void;
    readonly onSnapshot: (snapshot: RecordingSnapshot) => void;
  },
): JSX.Element {
  const {
    isProcessingCapture,
    isTimelapseCapturing,
    mediaItems,
    startTimelapseCapture,
    stopTimelapseCapture,
    timelapseShotsCaptured,
    timelapseState,
  } = useRecordingController();

  useEffect((): void => {
    onActions({
      startTimelapseCapture,
      stopTimelapseCapture,
    });
  }, [onActions, startTimelapseCapture, stopTimelapseCapture]);

  useEffect((): void => {
    onSnapshot({
      isProcessingCapture,
      isTimelapseCapturing,
      mediaCount: mediaItems.length,
      timelapseShotsCaptured,
      timelapseState,
    });
  }, [
    isProcessingCapture,
    isTimelapseCapturing,
    mediaItems.length,
    onSnapshot,
    timelapseShotsCaptured,
    timelapseState,
  ]);

  return <div>recording-harness</div>;
}

vi.mock('../RenderController', () => ({
  useRenderController: (): {
    readonly canvasRef: typeof mockedState.canvasRef;
  } => ({
    canvasRef: mockedState.canvasRef,
  }),
}));

vi.mock('../../context/AudioContext', () => ({
  useAudioContext: (): {
    readonly destinationStream: null;
    readonly ensureAudioContext: () => Promise<null>;
    readonly releaseLiveInputStream: () => Promise<void>;
    readonly requestLiveInputStream: () => Promise<void>;
  } => ({
    destinationStream: null,
    ensureAudioContext: () => Promise.resolve(null),
    releaseLiveInputStream: () => Promise.resolve(),
    requestLiveInputStream: () => Promise.resolve(),
  }),
}));

vi.mock('../../workers/TimelapseTimerWorker?worker', () => ({
  default: mockedState.MockTimelapseWorker,
}));

vi.mock('../../services/ImportedMediaHandleService', () => ({
  getImportedMediaCapability: (): ImportedMediaCapability => createImportedMediaCapability(),
  pickImportedMediaHandles: vi.fn((): Promise<readonly []> => Promise.resolve([])),
  prepareImportedMediaFiles: vi.fn((): Promise<readonly []> => Promise.resolve([])),
}));

vi.mock('../../services/CapturePresetStorageService', () => ({
  deleteCapturePreset: vi.fn((): Promise<void> => Promise.resolve()),
  listCapturePresets: vi.fn((): Promise<readonly []> => Promise.resolve([])),
  saveCapturePreset: vi.fn((): Promise<void> => Promise.resolve()),
}));

vi.mock('../../services/MediaStorageService', () => ({
  appendChunkedRecordingMediaChunk: vi.fn((): Promise<void> => Promise.resolve()),
  clearAll: vi.fn((): Promise<void> => Promise.resolve()),
  createChunkedRecordingMedia: vi.fn((): Promise<void> => Promise.resolve()),
  deleteMedia: vi.fn((): Promise<void> => Promise.resolve()),
  discardChunkedRecordingMedia: vi.fn((): Promise<void> => Promise.resolve()),
  ensureImportCopyCapacity: vi.fn((): Promise<void> => Promise.resolve()),
  finalizeChunkedRecordingMedia: vi.fn((): Promise<void> => Promise.resolve()),
  getAllMedia: vi.fn((): Promise<readonly MediaItem[]> => Promise.resolve(mockedState.mediaItems)),
  getMediaStorageStats: vi.fn((): Promise<MediaStorageStats> =>
    Promise.resolve(createStorageStats(mockedState.mediaItems.length)),
  ),
  resetMediaDatabase: vi.fn((): Promise<void> => Promise.resolve()),
  saveImportedMedia: vi.fn((): Promise<void> => Promise.resolve()),
  saveMedia: vi.fn(async (item: MediaItem): Promise<void> => {
    const saveMediaDeferred = mockedState.saveMediaDeferred;

    if (saveMediaDeferred !== null) {
      await saveMediaDeferred.promise;
    }

    mockedState.mediaItems = [...mockedState.mediaItems, item];
  }),
}));

describe('RecordingController timelapse stop settlement', () => {
  beforeEach((): void => {
    mockedState.mediaItems = [];
    mockedState.saveMediaDeferred = createDeferredPromise<void>();
    mockedState.workerInstances.length = 0;
    mockedState.canvasRef.current = {
      height: 360,
      toBlob: (
        callback: BlobCallback,
        mimeType?: string,
      ): void => {
        callback(
          new Blob(['timelapse-frame'], {
            type: mimeType ?? 'image/webp',
          }),
        );
      },
      toDataURL: (): string => 'data:image/webp;base64,thumb',
      width: 640,
    } as unknown as HTMLCanvasElement;
  });

  afterEach((): void => {
    vi.clearAllMocks();
  });

  it('drains the active timelapse capture before publishing the stopped state', async () => {
    let recordingActions: RecordingActions | null = null;
    let startTimelapsePromise: Promise<void> | null = null;
    const snapshots: RecordingSnapshot[] = [];

    render(
      <RecordingController>
        <RecordingHarness
          onActions={(actions: RecordingActions): void => {
            recordingActions = actions;
          }}
          onSnapshot={(snapshot: RecordingSnapshot): void => {
            snapshots.push(snapshot);
          }}
        />
      </RecordingController>,
    );

    await waitFor((): void => {
      expect(recordingActions).not.toBeNull();
    });

    await act(async (): Promise<void> => {
      startTimelapsePromise = recordingActions!.startTimelapseCapture();
      await Promise.resolve();
    });

    await waitFor((): void => {
      expect(snapshots.at(-1)).toMatchObject({
        isProcessingCapture: true,
        isTimelapseCapturing: true,
        mediaCount: 0,
        timelapseShotsCaptured: 0,
        timelapseState: 'running',
      });
    });

    const worker = mockedState.workerInstances[0];

    expect(worker).toBeDefined();
    expect(worker!.postMessage).not.toHaveBeenCalledWith({
      intervalMs: 5000,
      type: 'START',
    });

    act((): void => {
      recordingActions!.stopTimelapseCapture();
    });

    await waitFor((): void => {
      expect(snapshots.at(-1)).toMatchObject({
        isProcessingCapture: true,
        isTimelapseCapturing: true,
        mediaCount: 0,
        timelapseShotsCaptured: 0,
        timelapseState: 'stopping',
      });
    });

    expect(worker!.postMessage).toHaveBeenCalledWith({
      type: 'STOP',
    });

    await act(async (): Promise<void> => {
      mockedState.saveMediaDeferred!.resolve();
      await startTimelapsePromise;
      await Promise.resolve();
    });

    await waitFor((): void => {
      expect(snapshots.at(-1)).toMatchObject({
        isProcessingCapture: false,
        isTimelapseCapturing: false,
        mediaCount: 1,
        timelapseShotsCaptured: 1,
        timelapseState: 'idle',
      });
    });

    expect(snapshots.some((snapshot: RecordingSnapshot): boolean => snapshot.timelapseState === 'stopping')).toBe(true);
    expect(worker!.postMessage).not.toHaveBeenCalledWith({
      intervalMs: 5000,
      type: 'START',
    });
  });
});
