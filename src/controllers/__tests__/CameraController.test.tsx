// @vitest-environment jsdom

import { act, render } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CameraController, useCameraController } from '../CameraController';

interface CameraSnapshot {
  readonly activeDeviceId: string | null;
  readonly deviceCount: number;
  readonly error: string | null;
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

function createMockCameraStream(deviceId = 'camera-1'): MediaStream {
  const videoTrack = {
    getCapabilities: (): MediaTrackCapabilities => ({
      aspectRatio: {
        max: 16 / 9,
        min: 16 / 9,
      },
      frameRate: {
        max: 30,
        min: 24,
      },
      height: {
        max: 720,
        min: 720,
      },
      width: {
        max: 1280,
        min: 1280,
      },
    }),
    getSettings: (): MediaTrackSettings => ({
      deviceId,
      frameRate: 30,
      height: 720,
      width: 1280,
    }),
    kind: 'video',
    readyState: 'live',
    stop: vi.fn(),
  } as unknown as MediaStreamTrack;

  return {
    getAudioTracks: (): MediaStreamTrack[] => [],
    getTracks: (): MediaStreamTrack[] => [videoTrack],
    getVideoTracks: (): MediaStreamTrack[] => [videoTrack],
  } as MediaStream;
}

function CameraHarness(
  { onSnapshot }: { readonly onSnapshot: (snapshot: CameraSnapshot) => void },
): JSX.Element {
  const { activeDeviceId, deviceList, error } = useCameraController();

  useEffect((): void => {
    onSnapshot({
      activeDeviceId,
      deviceCount: deviceList.length,
      error,
    });
  }, [activeDeviceId, deviceList.length, error, onSnapshot]);

  return <div>camera-harness</div>;
}

describe('CameraController device refresh lifecycle', () => {
  afterEach((): void => {
    vi.restoreAllMocks();
  });

  it('applies refreshed device state while mounted', async () => {
    const enumerateDevices = vi.fn(
      (): Promise<MediaDeviceInfo[]> =>
        Promise.resolve([
          {
            deviceId: 'camera-1',
            groupId: 'group-1',
            kind: 'videoinput',
            label: 'Studio Camera',
            toJSON(): string {
              return 'Studio Camera';
            },
          } as MediaDeviceInfo,
        ]),
    );
    const getUserMedia = vi.fn((): Promise<MediaStream> => Promise.resolve(createMockCameraStream()));

    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      configurable: true,
      value: {
        addEventListener: vi.fn(),
        enumerateDevices,
        getUserMedia,
        removeEventListener: vi.fn(),
      },
    });

    const snapshots: CameraSnapshot[] = [];

    render(
      <CameraController>
        <CameraHarness
          onSnapshot={(snapshot: CameraSnapshot): void => {
            snapshots.push(snapshot);
          }}
        />
      </CameraController>,
    );

    await act(async (): Promise<void> => {
      await Promise.resolve();
    });

    expect(enumerateDevices).toHaveBeenCalled();
    expect(snapshots.at(-1)).toMatchObject({
      activeDeviceId: 'camera-1',
      deviceCount: 1,
      error: null,
    });
  });

  it('ignores late enumerateDevices completions after unmount', async () => {
    const deferredDevices = createDeferredPromise<MediaDeviceInfo[]>();
    const enumerateDevices = vi.fn((): Promise<MediaDeviceInfo[]> => deferredDevices.promise);
    const getUserMedia = vi.fn((): Promise<MediaStream> => Promise.resolve(createMockCameraStream()));

    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      configurable: true,
      value: {
        addEventListener: vi.fn(),
        enumerateDevices,
        getUserMedia,
        removeEventListener: vi.fn(),
      },
    });

    const snapshots: CameraSnapshot[] = [];

    const rendered = render(
      <CameraController>
        <CameraHarness
          onSnapshot={(snapshot: CameraSnapshot): void => {
            snapshots.push(snapshot);
          }}
        />
      </CameraController>,
    );

    expect(enumerateDevices).toHaveBeenCalledTimes(1);
    expect(snapshots).toHaveLength(1);

    rendered.unmount();

    await act(async (): Promise<void> => {
      deferredDevices.resolve([
        {
          deviceId: 'camera-late',
          groupId: 'group-late',
          kind: 'videoinput',
          label: 'Late Camera',
          toJSON(): string {
            return 'Late Camera';
          },
        } as MediaDeviceInfo,
      ]);
      await deferredDevices.promise;
      await Promise.resolve();
    });

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      activeDeviceId: null,
      deviceCount: 0,
      error: null,
    });
  });
});
