// @vitest-environment jsdom

import { act, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioProvider, useAudioContext } from '../AudioContext';

vi.mock('../../services/AudioMeterService', () => {
  class MockAudioMeterService {
    public readonly timelineOutputNode = {
      connect: vi.fn(),
      disconnect: vi.fn(),
    };

    public constructor() {}

    public createSnapshot(): {
      readonly liveInput: {
        readonly active: boolean;
        readonly channelCount: number;
        readonly channels: {
          readonly peak: number;
          readonly peakDbfs: null;
          readonly rms: number;
          readonly rmsDbfs: null;
        }[];
        readonly peak: number;
        readonly peakDbfs: null;
        readonly rms: number;
        readonly rmsDbfs: null;
      };
      readonly timelinePlayback: {
        readonly active: boolean;
        readonly channelCount: number;
        readonly channels: {
          readonly peak: number;
          readonly peakDbfs: null;
          readonly rms: number;
          readonly rmsDbfs: null;
        }[];
        readonly peak: number;
        readonly peakDbfs: null;
        readonly rms: number;
        readonly rmsDbfs: null;
      };
    } {
      return {
        liveInput: {
          active: false,
          channelCount: 2,
          channels: [
            { peak: 0, peakDbfs: null, rms: 0, rmsDbfs: null },
            { peak: 0, peakDbfs: null, rms: 0, rmsDbfs: null },
          ],
          peak: 0,
          peakDbfs: null,
          rms: 0,
          rmsDbfs: null,
        },
        timelinePlayback: {
          active: false,
          channelCount: 2,
          channels: [
            { peak: 0, peakDbfs: null, rms: 0, rmsDbfs: null },
            { peak: 0, peakDbfs: null, rms: 0, rmsDbfs: null },
          ],
          peak: 0,
          peakDbfs: null,
          rms: 0,
          rmsDbfs: null,
        },
      };
    }

    public dispose(): void {}

    public setLiveInputStream(): void {}
  }

  return {
    AudioMeterService: MockAudioMeterService,
  };
});

interface AudioContextHarnessHandle {
  readonly releaseLiveInputStream: (ownerId: string) => Promise<void>;
  readonly requestLiveInputStream: (ownerId: string) => Promise<boolean>;
}

class MockBrowserAudioContext {
  public readonly destination = {};

  public state: AudioContextState = 'running';

  public close = vi.fn((): Promise<void> => {
    this.state = 'closed';
    return Promise.resolve();
  });

  public createMediaStreamDestination(): MediaStreamAudioDestinationNode {
    return {
      stream: {
        getAudioTracks: (): MediaStreamTrack[] => [],
      } as MediaStream,
    } as MediaStreamAudioDestinationNode;
  }

  public resume = vi.fn((): Promise<void> => {
    this.state = 'running';
    return Promise.resolve();
  });
}

function AudioContextHarness(
  { harnessRef }: { readonly harnessRef: React.RefObject<AudioContextHarnessHandle> },
): JSX.Element {
  const { releaseLiveInputStream, requestLiveInputStream } = useAudioContext();

  Object.assign(harnessRef, {
    current: {
      releaseLiveInputStream,
      requestLiveInputStream,
    },
  });

  return <div>audio-context-harness</div>;
}

describe('AudioProvider live input ownership', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('AudioContext', MockBrowserAudioContext);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not acquire microphone input on idle mount', () => {
    const getUserMedia = vi.fn();
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia,
      },
    });

    const harnessRef = createRef<AudioContextHarnessHandle>();

    render(
      <AudioProvider>
        <AudioContextHarness harnessRef={harnessRef} />
      </AudioProvider>,
    );

    expect(harnessRef.current).not.toBeNull();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('acquires once for active owners and releases after the final owner leaves', async () => {
    const stopTrack = vi.fn();
    const stream = {
      getAudioTracks: (): MediaStreamTrack[] =>
        [
          {
            readyState: 'live',
            stop: stopTrack,
          } as unknown as MediaStreamTrack,
        ],
      getTracks: (): MediaStreamTrack[] =>
        [
          {
            stop: stopTrack,
          } as unknown as MediaStreamTrack,
        ],
    } as MediaStream;
    const getUserMedia = vi.fn((): Promise<MediaStream> => Promise.resolve(stream));

    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia,
      },
    });

    const harnessRef = createRef<AudioContextHarnessHandle>();

    render(
      <AudioProvider>
        <AudioContextHarness harnessRef={harnessRef} />
      </AudioProvider>,
    );

    expect(harnessRef.current).not.toBeNull();

    await act(async (): Promise<void> => {
      await harnessRef.current?.requestLiveInputStream('recording-controller');
    });
    expect(getUserMedia).toHaveBeenCalledTimes(1);

    await act(async (): Promise<void> => {
      await harnessRef.current?.requestLiveInputStream('secondary-owner');
    });
    expect(getUserMedia).toHaveBeenCalledTimes(1);

    await act(async (): Promise<void> => {
      await harnessRef.current?.releaseLiveInputStream('recording-controller');
    });
    expect(stopTrack).not.toHaveBeenCalled();

    await act(async (): Promise<void> => {
      await harnessRef.current?.releaseLiveInputStream('secondary-owner');
    });
    expect(stopTrack).toHaveBeenCalledTimes(1);
  });
});
