import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const SHIM_PATH = path.resolve(process.cwd(), 'extensions/auteura-browser-camera/page-shim.main.js');
const DEVICE_ID = 'auteura-browser-camera-preview';
const MESSAGE_PREFIX = '__auteura_virtual_output_page__';

class MockTrack {
  kind: string;
  readyState = 'live';
  onended: (() => void) | null = null;

  constructor(kind: string) {
    this.kind = kind;
  }

  clone(): MockTrack {
    return new MockTrack(this.kind);
  }

  stop(): void {
    this.readyState = 'ended';
    this.onended?.();
  }
}

class MockMediaStream {
  private readonly tracks: MockTrack[];

  constructor(tracks: MockTrack[] = []) {
    this.tracks = [...tracks];
  }

  addTrack(track: MockTrack): void {
    this.tracks.push(track);
  }

  getTracks(): MockTrack[] {
    return [...this.tracks];
  }

  getAudioTracks(): MockTrack[] {
    return this.tracks.filter((track) => track.kind === 'audio');
  }

  getVideoTracks(): MockTrack[] {
    return this.tracks.filter((track) => track.kind === 'video');
  }
}

class MockRTCPeerConnection {
  static instances: MockRTCPeerConnection[] = [];

  onicecandidate: ((event: { candidate: null | { toJSON(): unknown } }) => void) | null = null;
  ontrack: ((event: { track: MockTrack; streams: MockMediaStream[] }) => void) | null = null;

  constructor() {
    MockRTCPeerConnection.instances.push(this);
  }

  addTransceiver(): void {}

  async setRemoteDescription(): Promise<void> {}

  createAnswer(): Promise<{ sdp: string; type: 'answer' }> {
    return Promise.resolve({ sdp: 'answer-sdp', type: 'answer' });
  }

  async setLocalDescription(): Promise<void> {}

  async addIceCandidate(): Promise<void> {}

  close(): void {}
}

interface MessageEventListener {
  (event: {
    data: Record<string, unknown>;
    origin: string;
    source: unknown;
  }): void;
}

function loadShimHarness(): {
  getBridgeRequests: () => Record<string, unknown>[];
  mediaDevices: MediaDevices;
  resolveLatestRequestWithVideoTrack: () => Promise<MediaStream>;
} {
  MockRTCPeerConnection.instances.length = 0;

  const bridgeRequests: Record<string, unknown>[] = [];
  const listeners = new Map<string, Set<MessageEventListener>>();

  const windowObject = {
    addEventListener(type: string, listener: MessageEventListener): void {
      if (listeners.has(type) === false) {
        listeners.set(type, new Set());
      }

      listeners.get(type)?.add(listener);
    },
    clearTimeout,
    location: {
      origin: 'https://meet.google.com',
    },
    postMessage(message: Record<string, unknown>): void {
      if (message[MESSAGE_PREFIX] === true) {
        bridgeRequests.push(message);
      }
    },
    setTimeout,
  } as Record<string, unknown>;

  windowObject.top = windowObject;

  const mediaDevices = {
    ondevicechange: null,
    addEventListener(): void {},
    dispatchEvent(): boolean {
      return true;
    },
    enumerateDevices(): Promise<MediaDeviceInfo[]> {
      return Promise.resolve([]);
    },
    getDisplayMedia(): Promise<MediaStream> {
      return Promise.reject(new Error('Native getDisplayMedia should not be used in this test.'));
    },
    getUserMedia(): Promise<never> {
      return Promise.reject(new Error('Native getUserMedia should not be used in this test.'));
    },
    getSupportedConstraints(): MediaTrackSupportedConstraints {
      return {};
    },
    removeEventListener(): void {},
  } as MediaDevices;

  const context = {
    MediaStream: MockMediaStream,
    RTCPeerConnection: MockRTCPeerConnection,
    console,
    crypto: {
      randomUUID(): string {
        return `session-${bridgeRequests.length + 1}`;
      },
    },
    navigator: {
      mediaDevices,
    },
    window: windowObject,
  };

  vm.runInNewContext(readFileSync(SHIM_PATH, 'utf8'), context);

  return {
    getBridgeRequests(): Record<string, unknown>[] {
      return [...bridgeRequests];
    },
    mediaDevices,
    async resolveLatestRequestWithVideoTrack(): Promise<MediaStream> {
      const latestConnection = MockRTCPeerConnection.instances.at(-1);
      if (latestConnection?.ontrack === null || latestConnection?.ontrack === undefined) {
        throw new Error('Expected an active shim RTCPeerConnection.');
      }

      const incomingStream = new MockMediaStream([new MockTrack('video')]);
      const videoTrack = incomingStream.getVideoTracks()[0];
      if (videoTrack === undefined) {
        throw new Error('Expected a mock video track.');
      }
      latestConnection.ontrack({
        streams: [incomingStream],
        track: videoTrack,
      });

      return Promise.resolve(incomingStream as unknown as MediaStream);
    },
  };
}

describe('browser camera page shim request reuse', (): void => {
  it('coalesces simultaneous identical video requests into one handshake', async (): Promise<void> => {
    const harness = loadShimHarness();

    const firstRequestPromise = harness.mediaDevices.getUserMedia({
      video: {
        deviceId: {
          exact: DEVICE_ID,
        },
        width: 1280,
      },
    });

    const secondRequestPromise = harness.mediaDevices.getUserMedia({
      video: {
        deviceId: {
          exact: DEVICE_ID,
        },
        width: 1280,
      },
    });

    expect(harness.getBridgeRequests()).toHaveLength(1);
    await harness.resolveLatestRequestWithVideoTrack();

    const [firstStream, secondStream] = await Promise.all([
      firstRequestPromise,
      secondRequestPromise,
    ]);

    expect(firstStream).not.toBe(secondStream);
    expect(harness.getBridgeRequests()).toHaveLength(1);
  });

  it('reuses the shared stream for identical video constraints', async (): Promise<void> => {
    const harness = loadShimHarness();

    const firstRequestPromise = harness.mediaDevices.getUserMedia({
      video: {
        deviceId: {
          exact: DEVICE_ID,
        },
        width: 1280,
      },
    });

    expect(harness.getBridgeRequests()).toHaveLength(1);
    await harness.resolveLatestRequestWithVideoTrack();
    await firstRequestPromise;

    await harness.mediaDevices.getUserMedia({
      video: {
        deviceId: {
          exact: DEVICE_ID,
        },
        width: 1280,
      },
    });

    expect(harness.getBridgeRequests()).toHaveLength(1);
  });

  it('starts a fresh handshake when video constraints change', async (): Promise<void> => {
    const harness = loadShimHarness();

    const firstRequestPromise = harness.mediaDevices.getUserMedia({
      video: {
        deviceId: {
          exact: DEVICE_ID,
        },
        width: 640,
      },
    });

    expect(harness.getBridgeRequests()).toHaveLength(1);
    await harness.resolveLatestRequestWithVideoTrack();
    await firstRequestPromise;

    const secondRequestPromise = harness.mediaDevices.getUserMedia({
      video: {
        deviceId: {
          exact: DEVICE_ID,
        },
        width: 1280,
      },
    });

    expect(harness.getBridgeRequests()).toHaveLength(2);
    await harness.resolveLatestRequestWithVideoTrack();
    await secondRequestPromise;
  });
});
