import {
  defaultVirtualOutputStatus,
  type VirtualOutputStartOptions,
  type VirtualOutputBridgeState,
  type VirtualOutputStatusSnapshot,
} from '../types/virtualOutput';
import type { PerformanceCapabilities } from '../providers/PerformanceModeProvider';

interface VirtualOutputServiceDependencies {
  readonly captureCanvasStream?: (
    canvas: HTMLCanvasElement,
    targetFps: number,
  ) => MediaStream;
}

interface LeasedClientStream {
  readonly ownedVideoSourceStream: MediaStream | null;
  readonly stream: MediaStream;
}

export interface VirtualOutputDeliveryPolicy {
  readonly profile: 'balanced' | 'full' | 'safe';
  readonly targetFps: number;
}

export interface VirtualOutputClientStreamOptions {
  readonly includeAudio?: boolean;
  readonly includeVideo?: boolean;
}

function defaultCaptureCanvasStream(
  canvas: HTMLCanvasElement,
  targetFps: number,
): MediaStream {
  if (typeof canvas.captureStream !== 'function') {
    throw new Error('Virtual output requires HTMLCanvasElement.captureStream().');
  }

  return canvas.captureStream(targetFps);
}

export function resolveVirtualOutputDeliveryPolicy(
  capabilities: PerformanceCapabilities,
  clientCount: number = 0,
): VirtualOutputDeliveryPolicy {
  const profile = capabilities.virtualOutputProfile;
  const clientPenalty = clientCount > 1 ? Math.min(6, (clientCount - 1) * 3) : 0;

  return {
    profile:
      clientCount > 1 && profile === 'full'
        ? 'balanced'
        : clientCount > 2
          ? 'safe'
          : profile,
    targetFps: Math.max(12, capabilities.virtualOutputFrameRateCap - clientPenalty),
  };
}

export class AuteuraVirtualOutputService {
  private readonly captureCanvasStream: (
    canvas: HTMLCanvasElement,
    targetFps: number,
  ) => MediaStream;

  private audioEnabled = false;
  private audioStream: MediaStream | null = null;
  private bridgeState: VirtualOutputBridgeState = 'unavailable';
  private canvas: HTMLCanvasElement | null = null;
  private canvasSourceStream: MediaStream | null = null;
  private clientCount = 0;
  private extensionDetected = false;
  private deliveryProfile: VirtualOutputStatusSnapshot['deliveryProfile'] = 'safe';
  private hostRegistered = false;
  private lastBridgeEvent: string | null = null;
  private lastError: string | null = null;
  private lastHeartbeatAt: number | null = null;
  private outputStream: MediaStream | null = null;
  private leasedStreams = new Map<string, LeasedClientStream>();
  private state: VirtualOutputStatusSnapshot['state'] = 'idle';
  private subscribers = new Set<(snapshot: VirtualOutputStatusSnapshot) => void>();
  private targetFps = 0;
  private clonedAudioTracks: MediaStreamTrack[] = [];
  private outputVideoTracks: MediaStreamTrack[] = [];

  constructor(dependencies: VirtualOutputServiceDependencies = {}) {
    this.captureCanvasStream =
      dependencies.captureCanvasStream ?? defaultCaptureCanvasStream;
  }

  start(options: VirtualOutputStartOptions): MediaStream {
    this.state = 'starting';
    this.lastError = null;
    this.notify();

    try {
      this.canvas = options.canvas;
      this.targetFps = options.targetFps;
      this.audioEnabled = options.audioEnabled ?? this.audioEnabled;
      this.audioStream = options.audioStream ?? null;
      this.ensureOutputStream();
      this.replaceVideoTracks();
      this.syncAudioTracks();
      this.state = 'ready';
      this.lastError = null;
      this.notify();
      return this.outputStream as MediaStream;
    } catch (error: unknown) {
      this.state = 'error';
      this.lastError =
        error instanceof Error ? error.message : 'Virtual output failed to start.';
      this.removeOutputVideoTracks();
      this.teardownCanvasSourceStream();
      this.removeClonedAudioTracks();
      this.notify();
      throw error;
    }
  }

  stop(): void {
    this.releaseAllClientStreams();
    this.removeOutputVideoTracks();
    this.teardownCanvasSourceStream();
    this.removeClonedAudioTracks();
    this.outputStream = null;
    this.canvas = null;
    this.clientCount = 0;
    this.hostRegistered = false;
    this.lastBridgeEvent = null;
    this.lastHeartbeatAt = null;
    this.bridgeState = this.extensionDetected ? 'detected' : 'unavailable';
    this.targetFps = 0;
    this.lastError = null;
    this.state = 'idle';
    this.notify();
  }

  updateCanvas(canvas: HTMLCanvasElement, targetFps: number = this.targetFps): void {
    this.canvas = canvas;
    this.targetFps = targetFps;

    if (this.outputStream === null) {
      return;
    }

    try {
      this.replaceVideoTracks();
      this.lastError = null;
      this.state = 'ready';
    } catch (error: unknown) {
      this.state = 'error';
      this.lastError =
        error instanceof Error ? error.message : 'Virtual output failed to refresh.';
      throw error;
    } finally {
      this.notify();
    }
  }

  setAudioEnabled(enabled: boolean): void {
    this.audioEnabled = enabled;

    if (this.outputStream !== null) {
      this.syncAudioTracks();
    }

    if (this.state === 'ready' || this.state === 'idle') {
      this.notify();
    }
  }

  setAudioStream(stream: MediaStream | null): void {
    this.audioStream = stream;

    if (this.outputStream !== null) {
      this.syncAudioTracks();
    }

    if (this.state === 'ready' || this.state === 'idle') {
      this.notify();
    }
  }

  getOutputStream(): MediaStream | null {
    return this.outputStream;
  }

  createClientOutputStream(
    clientId: string,
    options: VirtualOutputClientStreamOptions = {},
  ): MediaStream | null {
    const sourceStream = this.outputStream;
    if (sourceStream === null) {
      return null;
    }

    this.releaseClientOutputStream(clientId);

    const includeAudio = options.includeAudio ?? true;
    const includeVideo = options.includeVideo ?? true;
    const clientStream = new MediaStream();
    let ownedVideoSourceStream: MediaStream | null = null;

    if (includeVideo) {
      ownedVideoSourceStream = this.createClientVideoSourceStream();

      if (ownedVideoSourceStream === null) {
        return null;
      }

      ownedVideoSourceStream.getVideoTracks().forEach((track: MediaStreamTrack): void => {
        clientStream.addTrack(track);
      });
    }

    if (includeAudio) {
      sourceStream.getAudioTracks().forEach((track: MediaStreamTrack): void => {
        clientStream.addTrack(track);
      });
    }

    this.leasedStreams.set(clientId, {
      ownedVideoSourceStream,
      stream: clientStream,
    });
    this.notify();
    return clientStream;
  }

  releaseClientOutputStream(clientId: string): void {
    const leasedStream = this.leasedStreams.get(clientId);
    if (leasedStream === undefined) {
      return;
    }

    leasedStream.ownedVideoSourceStream?.getTracks().forEach((track: MediaStreamTrack): void => {
      track.stop();
    });
    this.leasedStreams.delete(clientId);
    this.notify();
  }

  reportExtensionDetected(detected: boolean): void {
    this.extensionDetected = detected;
    this.bridgeState = detected
      ? this.hostRegistered
        ? 'registered'
        : 'detected'
      : 'unavailable';

    if (!detected) {
      this.hostRegistered = false;
      this.clientCount = 0;
      this.lastHeartbeatAt = null;
    }

    this.notify();
  }

  reportHostRegistration(registered: boolean): void {
    this.hostRegistered = registered;
    this.bridgeState = registered
      ? 'registered'
      : this.extensionDetected
        ? 'detected'
        : 'unavailable';

    if (!registered) {
      this.clientCount = 0;
      this.lastHeartbeatAt = null;
    }

    this.notify();
  }

  reportClientCount(clientCount: number): void {
    this.clientCount = Math.max(0, Math.floor(clientCount));
    this.notify();
  }

  reportHeartbeat(timestamp: number = Date.now()): void {
    this.lastHeartbeatAt = timestamp;

    if (this.extensionDetected && !this.hostRegistered) {
      this.hostRegistered = true;
      this.bridgeState = 'registered';
    }

    this.notify();
  }

  reportBridgeEvent(message: string | null): void {
    this.lastBridgeEvent = message;
    this.notify();
  }

  reportError(message: string | null): void {
    this.lastError = message;

    if (message !== null && this.state !== 'error') {
      this.state = 'error';
    }

    this.notify();
  }

  getStatusSnapshot(): VirtualOutputStatusSnapshot {
    return {
      bridgeState: this.bridgeState,
      clientCount: this.clientCount,
      extensionDetected: this.extensionDetected,
      hasAudio: this.clonedAudioTracks.length > 0,
      hasVideo: this.outputVideoTracks.length > 0,
      hostRegistered: this.hostRegistered,
      lastBridgeEvent: this.lastBridgeEvent,
      lastError: this.lastError,
      lastHeartbeatAt: this.lastHeartbeatAt,
      leasedStreamCount: this.leasedStreams.size,
      state: this.state,
      targetFps: this.targetFps,
      deliveryProfile: this.deliveryProfile,
    };
  }

  setDeliveryPolicy(policy: VirtualOutputDeliveryPolicy): void {
    this.deliveryProfile = policy.profile;

    if (this.targetFps !== policy.targetFps && this.canvas !== null) {
      this.updateCanvas(this.canvas, policy.targetFps);
      return;
    }

    this.targetFps = policy.targetFps;
    this.notify();
  }

  subscribeStatus(
    listener: (snapshot: VirtualOutputStatusSnapshot) => void,
  ): () => void {
    this.subscribers.add(listener);
    listener(this.getStatusSnapshot());

    return (): void => {
      this.subscribers.delete(listener);
    };
  }

  private ensureOutputStream(): void {
    if (this.outputStream === null) {
      this.outputStream = new MediaStream();
    }
  }

  private replaceVideoTracks(): void {
    if (this.canvas === null) {
      throw new Error('Virtual output requires a render canvas.');
    }

    if (this.targetFps <= 0) {
      throw new Error('Virtual output requires a positive target FPS.');
    }

    this.removeOutputVideoTracks();
    this.teardownCanvasSourceStream();

    this.canvasSourceStream = this.captureCanvasStream(this.canvas, this.targetFps);
    this.outputVideoTracks = this.canvasSourceStream.getVideoTracks();

    this.outputVideoTracks.forEach((track: MediaStreamTrack): void => {
      this.outputStream?.addTrack(track);
    });
  }

  private syncAudioTracks(): void {
    this.removeClonedAudioTracks();

    if (!this.audioEnabled || this.audioStream === null) {
      return;
    }

    this.clonedAudioTracks = this.audioStream
      .getAudioTracks()
      .map((track: MediaStreamTrack): MediaStreamTrack => track.clone());

    this.clonedAudioTracks.forEach((track: MediaStreamTrack): void => {
      this.outputStream?.addTrack(track);
    });
  }

  private removeOutputVideoTracks(): void {
    this.outputVideoTracks.forEach((track: MediaStreamTrack): void => {
      this.outputStream?.removeTrack(track);
    });
    this.outputVideoTracks = [];
  }

  private removeClonedAudioTracks(): void {
    this.clonedAudioTracks.forEach((track: MediaStreamTrack): void => {
      this.outputStream?.removeTrack(track);
      track.stop();
    });
    this.clonedAudioTracks = [];
  }

  private teardownCanvasSourceStream(): void {
    this.canvasSourceStream?.getTracks().forEach((track: MediaStreamTrack): void => {
      track.stop();
    });
    this.canvasSourceStream = null;
  }

  private createClientVideoSourceStream(): MediaStream | null {
    if (this.canvas === null || this.targetFps <= 0) {
      return null;
    }

    return this.captureCanvasStream(this.canvas, this.targetFps);
  }

  private releaseAllClientStreams(): void {
    [...this.leasedStreams.keys()].forEach((clientId: string): void => {
      this.releaseClientOutputStream(clientId);
    });
  }

  private notify(): void {
    const snapshot = this.getStatusSnapshot();
    this.subscribers.forEach((listener): void => {
      listener(snapshot);
    });
  }
}

export const defaultVirtualOutputSnapshot = defaultVirtualOutputStatus;
