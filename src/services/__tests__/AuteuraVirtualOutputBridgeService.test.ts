import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuteuraVirtualOutputService } from '../AuteuraVirtualOutputService';
import { AuteuraVirtualOutputBridgeService } from '../AuteuraVirtualOutputBridgeService';

class MockMediaStreamTrack {
  readonly id: string;
  readonly kind: 'audio' | 'video';

  constructor(kind: 'audio' | 'video', id: string) {
    this.kind = kind;
    this.id = id;
  }

  clone(): MockMediaStreamTrack {
    return new MockMediaStreamTrack(this.kind, `${this.id}-clone`);
  }

  stop(): void {
    // noop
  }

  getSettings(): MediaTrackSettings {
    return {
      height: 720,
      width: 1280,
    };
  }
}

class MockMediaStream {
  private readonly tracks: MockMediaStreamTrack[] = [];

  constructor(initialTracks: readonly MockMediaStreamTrack[] = []) {
    initialTracks.forEach((track): void => {
      this.addTrack(track);
    });
  }

  addTrack(track: MockMediaStreamTrack): void {
    this.tracks.push(track);
  }

  removeTrack(track: MockMediaStreamTrack): void {
    const index = this.tracks.indexOf(track);
    if (index >= 0) {
      this.tracks.splice(index, 1);
    }
  }

  getTracks(): MockMediaStreamTrack[] {
    return [...this.tracks];
  }

  getVideoTracks(): MockMediaStreamTrack[] {
    return this.tracks.filter((track): boolean => track.kind === 'video');
  }

  getAudioTracks(): MockMediaStreamTrack[] {
    return this.tracks.filter((track): boolean => track.kind === 'audio');
  }
}

class MockPeerConnection {
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
  addedTracks: readonly string[] = [];
  closed = false;

  addTrack(track: MediaStreamTrack): void {
    this.addedTracks = [...this.addedTracks, track.id];
  }

  createOffer(): Promise<RTCSessionDescriptionInit> {
    return Promise.resolve({
      sdp: 'mock-offer',
      type: 'offer',
    });
  }

  setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = description;
    return Promise.resolve();
  }

  setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = description;
    return Promise.resolve();
  }

  addIceCandidate(_candidate: RTCIceCandidateInit | null): Promise<void> {
    return Promise.resolve();
  }

  close(): void {
    this.closed = true;
  }
}

class MockDocument {
  hasMarker = true;
  readonly documentElement = {};
  visibilityState: 'hidden' | 'visible' = 'visible';
  private readonly listeners = new Map<string, Set<() => void>>();

  querySelector(selector: string): Record<string, never> | null {
    if (selector === 'meta[name="auteura-extension-id"]' && this.hasMarker) {
      return {};
    }

    return null;
  }

  addEventListener(type: string, listener: () => void): void {
    const current = this.listeners.get(type) ?? new Set();
    current.add(listener);
    this.listeners.set(type, current);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  setVisibilityState(nextState: 'hidden' | 'visible'): void {
    this.visibilityState = nextState;
    this.listeners.get('visibilitychange')?.forEach((listener): void => {
      listener();
    });
  }
}

class MockWindow {
  readonly document = new MockDocument();
  readonly location = { origin: 'http://localhost:5173' };
  readonly MutationObserver = undefined;
  private readonly listeners = new Map<string, Set<(event: MessageEvent) => void>>();
  readonly postedMessages: unknown[] = [];

  clearInterval(intervalId: ReturnType<typeof setInterval>): void {
    clearInterval(intervalId);
  }

  clearTimeout(timeoutId: ReturnType<typeof setTimeout>): void {
    clearTimeout(timeoutId);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    const current = this.listeners.get(type) ?? new Set();
    current.add(listener);
    this.listeners.set(type, current);
  }

  removeEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  postMessage(message: unknown, _targetOrigin: string): void {
    this.postedMessages.push(message);
  }

  setInterval(handler: () => void, delayMs: number): ReturnType<typeof setInterval> {
    return setInterval(handler, delayMs);
  }

  setTimeout(handler: () => void, delayMs: number): ReturnType<typeof setTimeout> {
    return setTimeout(handler, delayMs);
  }

  dispatchMessage(data: Record<string, unknown>): void {
    const event = {
      data,
      origin: this.location.origin,
      source: this,
    } as unknown as MessageEvent;

    this.listeners.get('message')?.forEach((listener): void => {
      listener(event);
    });
  }
}

describe('AuteuraVirtualOutputBridgeService', (): void => {
  afterEach((): void => {
    vi.useRealTimers();
  });

  it('registers the host and completes a browser-camera offer/answer handshake', async (): Promise<void> => {
    const originalMediaStream = globalThis.MediaStream;
    vi.stubGlobal('MediaStream', MockMediaStream);

    try {
      const virtualOutputService = new AuteuraVirtualOutputService({
        captureCanvasStream: (): MediaStream =>
          new MockMediaStream([new MockMediaStreamTrack('video', 'camera-track')]) as unknown as MediaStream,
      });
      virtualOutputService.start({
        canvas: {} as HTMLCanvasElement,
        targetFps: 24,
      });

      const mockWindow = new MockWindow();
      const peerConnection = new MockPeerConnection();
      const bridgeService = new AuteuraVirtualOutputBridgeService(virtualOutputService, {
        createPeerConnection: (): RTCPeerConnection =>
          peerConnection as unknown as RTCPeerConnection,
        now: (): number => 1700000000000,
        windowObject: mockWindow as unknown as Window,
      });

      bridgeService.start();

      const registerMessage = mockWindow.postedMessages[0] as Record<string, unknown>;
      expect(registerMessage.type).toBe('HOST_REGISTER');

      mockWindow.dispatchMessage({
        __auteura_virtual_output_host_response__: true,
        hostId: 'host-1',
        protocol: 'auteura-virtual-output',
        protocolVersion: 1,
        sessionId: registerMessage.sessionId,
        timestamp: 1700000000001,
        type: 'HOST_REGISTER_ACK',
      });

      mockWindow.dispatchMessage({
        __auteura_virtual_output_host_response__: true,
        clientId: 'client-1',
        protocol: 'auteura-virtual-output',
        protocolVersion: 1,
        request: {
          audio: false,
        },
        sessionId: 'session-1',
        timestamp: 1700000000002,
        type: 'HANDSHAKE_INIT',
      });

      await Promise.resolve();
      await Promise.resolve();

      const offerMessage = mockWindow.postedMessages[1] as Record<string, unknown>;

      expect(offerMessage.type).toBe('OFFER');
      expect(virtualOutputService.getStatusSnapshot()).toMatchObject({
        clientCount: 1,
        hostRegistered: true,
        lastBridgeEvent: 'Offer created for client-1.',
      });

      mockWindow.dispatchMessage({
        __auteura_virtual_output_host_response__: true,
        clientId: 'client-1',
        protocol: 'auteura-virtual-output',
        protocolVersion: 1,
        sdp: {
          sdp: 'mock-answer',
          type: 'answer',
        },
        sessionId: 'session-1',
        timestamp: 1700000000003,
        type: 'ANSWER',
      });

      await Promise.resolve();

      expect(peerConnection.remoteDescription).toEqual({
        sdp: 'mock-answer',
        type: 'answer',
      });

      mockWindow.dispatchMessage({
        __auteura_virtual_output_host_response__: true,
        clientId: 'client-1',
        protocol: 'auteura-virtual-output',
        protocolVersion: 1,
        sessionId: 'bridge',
        timestamp: 1700000000004,
        type: 'CLIENT_DISCONNECTED',
      });

      expect(peerConnection.closed).toBe(true);
      expect(virtualOutputService.getStatusSnapshot().clientCount).toBe(0);
    } finally {
      vi.unstubAllGlobals();
      if (originalMediaStream !== undefined) {
        vi.stubGlobal('MediaStream', originalMediaStream);
      }
    }
  });

  it('retries host registration after a bridge offline event and answers heartbeat pongs', async (): Promise<void> => {
    vi.useFakeTimers();
    const originalMediaStream = globalThis.MediaStream;
    vi.stubGlobal('MediaStream', MockMediaStream);

    try {
      const virtualOutputService = new AuteuraVirtualOutputService({
        captureCanvasStream: (): MediaStream =>
          new MockMediaStream([new MockMediaStreamTrack('video', 'camera-track')]) as unknown as MediaStream,
      });
      virtualOutputService.start({
        canvas: {} as HTMLCanvasElement,
        targetFps: 24,
      });

      const mockWindow = new MockWindow();
      const bridgeService = new AuteuraVirtualOutputBridgeService(virtualOutputService, {
        now: (): number => 1700000000000,
        windowObject: mockWindow as unknown as Window,
      });

      bridgeService.start();

      const firstRegisterMessage = mockWindow.postedMessages[0] as Record<string, unknown>;
      mockWindow.dispatchMessage({
        __auteura_virtual_output_host_response__: true,
        hostId: 'host-1',
        protocol: 'auteura-virtual-output',
        protocolVersion: 1,
        sessionId: firstRegisterMessage.sessionId,
        timestamp: 1700000000001,
        type: 'HOST_REGISTER_ACK',
      });

      mockWindow.dispatchMessage({
        __auteura_virtual_output_host_response__: true,
        protocol: 'auteura-virtual-output',
        protocolVersion: 1,
        reason: 'Host bridge disconnected.',
        sessionId: 'bridge',
        timestamp: 1700000000002,
        type: 'HOST_OFFLINE',
      });

      expect(virtualOutputService.getStatusSnapshot().hostRegistered).toBe(false);

      await vi.advanceTimersByTimeAsync(1500);

      const secondRegisterMessage = mockWindow.postedMessages.at(-1) as Record<string, unknown>;
      expect(secondRegisterMessage.type).toBe('HOST_REGISTER');

      mockWindow.dispatchMessage({
        __auteura_virtual_output_host_response__: true,
        hostId: 'host-1',
        protocol: 'auteura-virtual-output',
        protocolVersion: 1,
        sessionId: secondRegisterMessage.sessionId,
        timestamp: 1700000000003,
        type: 'HOST_REGISTER_ACK',
      });

      await vi.advanceTimersByTimeAsync(5000);
      const pingMessage = mockWindow.postedMessages.at(-1) as Record<string, unknown>;
      expect(pingMessage.type).toBe('PING');

      mockWindow.dispatchMessage({
        __auteura_virtual_output_host_response__: true,
        actorId: 'host-1',
        protocol: 'auteura-virtual-output',
        protocolVersion: 1,
        sessionId: pingMessage.sessionId,
        timestamp: 1700000000004,
        type: 'PONG',
      });

      expect(virtualOutputService.getStatusSnapshot().lastHeartbeatAt).toBe(1700000000004);
    } finally {
      vi.unstubAllGlobals();
      if (originalMediaStream !== undefined) {
        vi.stubGlobal('MediaStream', originalMediaStream);
      }
    }
  });

  it('ignores stale heartbeat responses and backs off repeated registration retries', async (): Promise<void> => {
    vi.useFakeTimers();
    vi.setSystemTime(1700000000000);
    const originalMediaStream = globalThis.MediaStream;
    vi.stubGlobal('MediaStream', MockMediaStream);

    try {
      const virtualOutputService = new AuteuraVirtualOutputService({
        captureCanvasStream: (): MediaStream =>
          new MockMediaStream([new MockMediaStreamTrack('video', 'camera-track')]) as unknown as MediaStream,
      });
      virtualOutputService.start({
        canvas: {} as HTMLCanvasElement,
        targetFps: 24,
      });

      const mockWindow = new MockWindow();
      const bridgeService = new AuteuraVirtualOutputBridgeService(virtualOutputService, {
        now: (): number => Date.now(),
        windowObject: mockWindow as unknown as Window,
      });

      bridgeService.start();

      const firstRegisterMessage = mockWindow.postedMessages[0] as Record<string, unknown>;
      mockWindow.dispatchMessage({
        __auteura_virtual_output_host_response__: true,
        hostId: 'host-1',
        protocol: 'auteura-virtual-output',
        protocolVersion: 1,
        sessionId: firstRegisterMessage.sessionId,
        timestamp: 1700000000001,
        type: 'HOST_REGISTER_ACK',
      });

      await vi.advanceTimersByTimeAsync(5000);
      const firstPingMessage = mockWindow.postedMessages.at(-1) as Record<string, unknown>;
      expect(firstPingMessage.type).toBe('PING');

      mockWindow.dispatchMessage({
        __auteura_virtual_output_host_response__: true,
        actorId: 'wrong-host',
        protocol: 'auteura-virtual-output',
        protocolVersion: 1,
        sessionId: firstPingMessage.sessionId,
        timestamp: 1700000000002,
        type: 'PONG',
      });

      const postedBeforeTimeout = mockWindow.postedMessages.length;
      await vi.advanceTimersByTimeAsync(14999);
      expect(mockWindow.postedMessages).toHaveLength(postedBeforeTimeout);

      await vi.advanceTimersByTimeAsync(1);
      expect(virtualOutputService.getStatusSnapshot().hostRegistered).toBe(false);

      await vi.advanceTimersByTimeAsync(1499);
      expect(mockWindow.postedMessages).toHaveLength(postedBeforeTimeout);

      await vi.advanceTimersByTimeAsync(1);
      const secondRegisterMessage = mockWindow.postedMessages.at(-1) as Record<string, unknown>;
      expect(secondRegisterMessage.type).toBe('HOST_REGISTER');

      mockWindow.dispatchMessage({
        __auteura_virtual_output_host_response__: true,
        protocol: 'auteura-virtual-output',
        protocolVersion: 1,
        reason: 'Host bridge disconnected.',
        sessionId: 'bridge',
        timestamp: 1700000000003,
        type: 'HOST_OFFLINE',
      });

      const postedBeforeBackoffRetry = mockWindow.postedMessages.length;
      await vi.advanceTimersByTimeAsync(2999);
      expect(mockWindow.postedMessages).toHaveLength(postedBeforeBackoffRetry);

      await vi.advanceTimersByTimeAsync(1);
      const thirdRegisterMessage = mockWindow.postedMessages.at(-1) as Record<string, unknown>;
      expect(thirdRegisterMessage.type).toBe('HOST_REGISTER');
    } finally {
      vi.unstubAllGlobals();
      if (originalMediaStream !== undefined) {
        vi.stubGlobal('MediaStream', originalMediaStream);
      }
    }
  });

  it('tolerates hidden-tab heartbeat drift without falsely dropping the host', async (): Promise<void> => {
    vi.useFakeTimers();
    vi.setSystemTime(1700000000000);
    const originalMediaStream = globalThis.MediaStream;
    vi.stubGlobal('MediaStream', MockMediaStream);

    try {
      const virtualOutputService = new AuteuraVirtualOutputService({
        captureCanvasStream: (): MediaStream =>
          new MockMediaStream([new MockMediaStreamTrack('video', 'camera-track')]) as unknown as MediaStream,
      });
      virtualOutputService.start({
        canvas: {} as HTMLCanvasElement,
        targetFps: 24,
      });

      const mockWindow = new MockWindow();
      const bridgeService = new AuteuraVirtualOutputBridgeService(virtualOutputService, {
        now: (): number => Date.now(),
        windowObject: mockWindow as unknown as Window,
      });

      bridgeService.start();

      const registerMessage = mockWindow.postedMessages[0] as Record<string, unknown>;
      mockWindow.dispatchMessage({
        __auteura_virtual_output_host_response__: true,
        hostId: 'host-1',
        protocol: 'auteura-virtual-output',
        protocolVersion: 1,
        sessionId: registerMessage.sessionId,
        timestamp: Date.now() + 1,
        type: 'HOST_REGISTER_ACK',
      });

      await vi.advanceTimersByTimeAsync(5000);
      expect((mockWindow.postedMessages.at(-1) as Record<string, unknown>).type).toBe('PING');

      mockWindow.document.setVisibilityState('hidden');
      await vi.advanceTimersByTimeAsync(45000);

      expect(virtualOutputService.getStatusSnapshot().hostRegistered).toBe(true);
      expect(virtualOutputService.getStatusSnapshot().lastError).toBeNull();

      mockWindow.document.setVisibilityState('visible');
      await vi.advanceTimersByTimeAsync(5000);

      expect((mockWindow.postedMessages.at(-1) as Record<string, unknown>).type).toBe('PING');
      expect(virtualOutputService.getStatusSnapshot().hostRegistered).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      if (originalMediaStream !== undefined) {
        vi.stubGlobal('MediaStream', originalMediaStream);
      }
    }
  });

  it('rejects stale inbound bridge messages', (): void => {
    const originalMediaStream = globalThis.MediaStream;
    vi.stubGlobal('MediaStream', MockMediaStream);

    try {
      const virtualOutputService = new AuteuraVirtualOutputService({
        captureCanvasStream: (): MediaStream =>
          new MockMediaStream([new MockMediaStreamTrack('video', 'camera-track')]) as unknown as MediaStream,
      });
      virtualOutputService.start({
        canvas: {} as HTMLCanvasElement,
        targetFps: 24,
      });

      const mockWindow = new MockWindow();
      const bridgeService = new AuteuraVirtualOutputBridgeService(virtualOutputService, {
        now: (): number => 1700000000000,
        windowObject: mockWindow as unknown as Window,
      });

      bridgeService.start();

      const registerMessage = mockWindow.postedMessages[0] as Record<string, unknown>;
      mockWindow.dispatchMessage({
        __auteura_virtual_output_host_response__: true,
        hostId: 'host-1',
        protocol: 'auteura-virtual-output',
        protocolVersion: 1,
        sessionId: registerMessage.sessionId,
        timestamp: 1699999900000,
        type: 'HOST_REGISTER_ACK',
      });

      expect(virtualOutputService.getStatusSnapshot()).toMatchObject({
        hostRegistered: false,
        lastError: 'Virtual output bridge rejected a stale or unsupported message.',
      });
    } finally {
      vi.unstubAllGlobals();
      if (originalMediaStream !== undefined) {
        vi.stubGlobal('MediaStream', originalMediaStream);
      }
    }
  });
});
