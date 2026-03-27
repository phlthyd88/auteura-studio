import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AuteuraVirtualOutputService,
  resolveVirtualOutputDeliveryPolicy,
} from '../AuteuraVirtualOutputService';
import type { PerformanceCapabilities } from '../../providers/PerformanceModeProvider';

class MockMediaStreamTrack {
  readonly kind: 'audio' | 'video';
  cloneCount = 0;
  stopped = false;

  constructor(kind: 'audio' | 'video') {
    this.kind = kind;
  }

  clone(): MockMediaStreamTrack {
    this.cloneCount += 1;
    return new MockMediaStreamTrack(this.kind);
  }

  stop(): void {
    this.stopped = true;
  }
}

class MockMediaStream {
  private readonly tracks: MockMediaStreamTrack[] = [];

  constructor(initialTracks: readonly MockMediaStreamTrack[] = []) {
    initialTracks.forEach((track: MockMediaStreamTrack): void => {
      this.addTrack(track);
    });
  }

  addTrack(track: MockMediaStreamTrack): void {
    this.tracks.push(track);
  }

  removeTrack(track: MockMediaStreamTrack): void {
    const nextIndex = this.tracks.indexOf(track);

    if (nextIndex >= 0) {
      this.tracks.splice(nextIndex, 1);
    }
  }

  getTracks(): MockMediaStreamTrack[] {
    return [...this.tracks];
  }

  getVideoTracks(): MockMediaStreamTrack[] {
    return this.tracks.filter((track: MockMediaStreamTrack): boolean => track.kind === 'video');
  }

  getAudioTracks(): MockMediaStreamTrack[] {
    return this.tracks.filter((track: MockMediaStreamTrack): boolean => track.kind === 'audio');
  }
}

const baseCapabilities: PerformanceCapabilities = {
  aiFrameRateCap: 10,
  allowBackgroundBlur: false,
  allowScopes: false,
  bypassHeavyPreviewPasses: true,
  qualityScale: 0.5,
  scopeAnalysisMode: 'disabled',
  scopeFrameRateCap: 0,
  scopeSampleHeight: 27,
  scopeSampleWidth: 48,
  virtualOutputFrameRateCap: 15,
  virtualOutputProfile: 'safe',
};

describe('AuteuraVirtualOutputService', (): void => {
  const originalMediaStream = globalThis.MediaStream;

  beforeEach((): void => {
    vi.stubGlobal('MediaStream', MockMediaStream);
  });

  afterEach((): void => {
    vi.unstubAllGlobals();

    if (originalMediaStream !== undefined) {
      vi.stubGlobal('MediaStream', originalMediaStream);
    }
  });

  it('starts from a canvas stream and tears down cleanly', (): void => {
    const canvasTrack = new MockMediaStreamTrack('video');
    const captureCanvasStream = vi.fn(
      (_canvas: HTMLCanvasElement, _targetFps: number): MediaStream =>
        new MockMediaStream([canvasTrack]) as unknown as MediaStream,
    );
    const service = new AuteuraVirtualOutputService({
      captureCanvasStream,
    });
    const statusSnapshots = vi.fn();

    service.subscribeStatus(statusSnapshots);

    const outputStream = service.start({
      canvas: {} as HTMLCanvasElement,
      targetFps: 24,
    });

    expect(captureCanvasStream).toHaveBeenCalledWith(expect.any(Object), 24);
    expect(outputStream.getVideoTracks()).toHaveLength(1);
    expect(service.getStatusSnapshot()).toMatchObject({
      deliveryProfile: 'safe',
      hasAudio: false,
      hasVideo: true,
      state: 'ready',
      targetFps: 24,
    });

    service.stop();

    expect(canvasTrack.stopped).toBe(true);
    expect(service.getOutputStream()).toBeNull();
    expect(service.getStatusSnapshot().state).toBe('idle');
    expect(statusSnapshots).toHaveBeenCalled();
  });

  it('replaces the canvas stream without leaking the previous tracks', (): void => {
    const firstCanvasTrack = new MockMediaStreamTrack('video');
    const secondCanvasTrack = new MockMediaStreamTrack('video');
    const captureCanvasStream = vi
      .fn((_canvas: HTMLCanvasElement, _targetFps: number): MediaStream =>
        new MockMediaStream([firstCanvasTrack]) as unknown as MediaStream,
      )
      .mockReturnValueOnce(new MockMediaStream([firstCanvasTrack]) as unknown as MediaStream)
      .mockReturnValueOnce(new MockMediaStream([secondCanvasTrack]) as unknown as MediaStream);
    const service = new AuteuraVirtualOutputService({
      captureCanvasStream,
    });

    const outputStream = service.start({
      canvas: {} as HTMLCanvasElement,
      targetFps: 24,
    });
    const firstOutputTrack = outputStream.getVideoTracks()[0] as unknown as MockMediaStreamTrack;

    service.updateCanvas({} as HTMLCanvasElement, 30);

    const secondOutputTrack = outputStream.getVideoTracks()[0] as unknown as MockMediaStreamTrack;

    expect(firstCanvasTrack.stopped).toBe(true);
    expect(firstOutputTrack.stopped).toBe(true);
    expect(secondOutputTrack).not.toBe(firstOutputTrack);
    expect(service.getStatusSnapshot()).toMatchObject({
      hasVideo: true,
      state: 'ready',
      targetFps: 30,
    });
  });

  it('includes and removes audio tracks when toggled', (): void => {
    const canvasTrack = new MockMediaStreamTrack('video');
    const audioTrack = new MockMediaStreamTrack('audio');
    const service = new AuteuraVirtualOutputService({
      captureCanvasStream: (): MediaStream =>
        new MockMediaStream([canvasTrack]) as unknown as MediaStream,
    });

    const outputStream = service.start({
      audioEnabled: true,
      audioStream: new MockMediaStream([audioTrack]) as unknown as MediaStream,
      canvas: {} as HTMLCanvasElement,
      targetFps: 24,
    });

    const clonedAudioTrack = outputStream.getAudioTracks()[0] as unknown as MockMediaStreamTrack;

    expect(outputStream.getAudioTracks()).toHaveLength(1);
    expect(service.getStatusSnapshot().hasAudio).toBe(true);

    service.setAudioEnabled(false);

    expect(clonedAudioTrack.stopped).toBe(true);
    expect(outputStream.getAudioTracks()).toHaveLength(0);
    expect(service.getStatusSnapshot().hasAudio).toBe(false);
  });

  it('resolves virtual output delivery policy from performance capabilities', (): void => {
    expect(
      resolveVirtualOutputDeliveryPolicy({
        ...baseCapabilities,
        virtualOutputFrameRateCap: 30,
        virtualOutputProfile: 'full',
      }),
    ).toEqual({
      profile: 'full',
      targetFps: 30,
    });
    expect(
      resolveVirtualOutputDeliveryPolicy({
        ...baseCapabilities,
        virtualOutputFrameRateCap: 24,
        virtualOutputProfile: 'balanced',
      }),
    ).toEqual({
      profile: 'balanced',
      targetFps: 24,
    });
    expect(resolveVirtualOutputDeliveryPolicy(baseCapabilities, 3)).toEqual({
      profile: 'safe',
      targetFps: 12,
    });
  });

  it('tracks bridge detection, registration, clients, and heartbeat diagnostics', (): void => {
    const service = new AuteuraVirtualOutputService();

    service.reportExtensionDetected(true);
    service.reportHostRegistration(true);
    service.reportClientCount(2);
    service.reportHeartbeat(12345);

    expect(service.getStatusSnapshot()).toMatchObject({
      bridgeState: 'registered',
      clientCount: 2,
      deliveryProfile: 'safe',
      extensionDetected: true,
      hostRegistered: true,
      lastHeartbeatAt: 12345,
    });

    service.stop();

    expect(service.getStatusSnapshot()).toMatchObject({
      bridgeState: 'detected',
      clientCount: 0,
      deliveryProfile: 'safe',
      extensionDetected: true,
      hostRegistered: false,
      lastHeartbeatAt: null,
      leasedStreamCount: 0,
      state: 'idle',
    });
  });

  it('leases isolated client streams and releases them independently', (): void => {
    const hostTrack = new MockMediaStreamTrack('video');
    const clientATrack = new MockMediaStreamTrack('video');
    const clientBTrack = new MockMediaStreamTrack('video');
    const captureCanvasStream = vi
      .fn((_canvas: HTMLCanvasElement, _targetFps: number): MediaStream =>
        new MockMediaStream([hostTrack]) as unknown as MediaStream,
      )
      .mockReturnValueOnce(new MockMediaStream([hostTrack]) as unknown as MediaStream)
      .mockReturnValueOnce(new MockMediaStream([clientATrack]) as unknown as MediaStream)
      .mockReturnValueOnce(new MockMediaStream([clientBTrack]) as unknown as MediaStream);
    const service = new AuteuraVirtualOutputService({
      captureCanvasStream,
    });

    const hostOutputStream = service.start({
      canvas: {} as HTMLCanvasElement,
      targetFps: 24,
    });
    const hostOutputTrack = hostOutputStream.getVideoTracks()[0] as unknown as MockMediaStreamTrack;

    const firstClientStream = service.createClientOutputStream('client-a');
    const secondClientStream = service.createClientOutputStream('client-b');

    expect(firstClientStream).not.toBeNull();
    expect(secondClientStream).not.toBeNull();

    const firstClientTrack =
      firstClientStream?.getVideoTracks()[0] as unknown as MockMediaStreamTrack;
    const secondClientTrack =
      secondClientStream?.getVideoTracks()[0] as unknown as MockMediaStreamTrack;

    expect(firstClientTrack).not.toBe(hostOutputTrack);
    expect(secondClientTrack).not.toBe(hostOutputTrack);
    expect(firstClientTrack).not.toBe(secondClientTrack);
    expect(hostTrack.cloneCount).toBe(0);
    expect(clientATrack.cloneCount).toBe(0);
    expect(clientBTrack.cloneCount).toBe(0);
    expect(service.getStatusSnapshot().leasedStreamCount).toBe(2);

    service.releaseClientOutputStream('client-a');

    expect(firstClientTrack.stopped).toBe(true);
    expect(secondClientTrack.stopped).toBe(false);
    expect(hostOutputTrack.stopped).toBe(false);
    expect(service.getStatusSnapshot().leasedStreamCount).toBe(1);

    service.stop();

    expect(secondClientTrack.stopped).toBe(true);
    expect(hostOutputTrack.stopped).toBe(true);
    expect(service.getStatusSnapshot().leasedStreamCount).toBe(0);
  });

  it('updates delivery policy without leaking leased client streams', (): void => {
    const firstCanvasTrack = new MockMediaStreamTrack('video');
    const leasedCanvasTrack = new MockMediaStreamTrack('video');
    const secondCanvasTrack = new MockMediaStreamTrack('video');
    const captureCanvasStream = vi
      .fn((_canvas: HTMLCanvasElement, _targetFps: number): MediaStream =>
        new MockMediaStream([firstCanvasTrack]) as unknown as MediaStream,
      )
      .mockReturnValueOnce(new MockMediaStream([firstCanvasTrack]) as unknown as MediaStream)
      .mockReturnValueOnce(new MockMediaStream([leasedCanvasTrack]) as unknown as MediaStream)
      .mockReturnValueOnce(new MockMediaStream([secondCanvasTrack]) as unknown as MediaStream);
    const service = new AuteuraVirtualOutputService({
      captureCanvasStream,
    });

    service.start({
      canvas: {} as HTMLCanvasElement,
      targetFps: 24,
    });
    const clientStream = service.createClientOutputStream('client-a');
    const leasedTrack = clientStream?.getVideoTracks()[0] as unknown as MockMediaStreamTrack;

    service.setDeliveryPolicy({
      profile: 'balanced',
      targetFps: 20,
    });

    expect(firstCanvasTrack.stopped).toBe(true);
    expect(leasedTrack.stopped).toBe(false);
    expect(service.getStatusSnapshot()).toMatchObject({
      deliveryProfile: 'balanced',
      leasedStreamCount: 1,
      state: 'ready',
      targetFps: 20,
    });
  });

  it('leases video-only client streams when audio is excluded', (): void => {
    const service = new AuteuraVirtualOutputService({
      captureCanvasStream: (): MediaStream =>
        new MockMediaStream([new MockMediaStreamTrack('video')]) as unknown as MediaStream,
    });

    service.start({
      audioEnabled: true,
      audioStream: new MockMediaStream([new MockMediaStreamTrack('audio')]) as unknown as MediaStream,
      canvas: {} as HTMLCanvasElement,
      targetFps: 24,
    });

    const clientStream = service.createClientOutputStream('client-video', {
      includeAudio: false,
      includeVideo: true,
    });

    expect(clientStream?.getVideoTracks()).toHaveLength(1);
    expect(clientStream?.getAudioTracks()).toHaveLength(0);
  });
});
