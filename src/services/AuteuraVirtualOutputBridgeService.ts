import { AuteuraVirtualOutputService } from './AuteuraVirtualOutputService';
import {
  createVirtualOutputMessageEnvelope,
  isVirtualOutputMessage,
  parseVirtualOutputMessage,
} from './VirtualOutputProtocol';
import type {
  VirtualOutputClientRequest,
  VirtualOutputIceCandidateMessage,
  VirtualOutputOfferMessage,
  VirtualOutputSignalMessage,
} from '../types/virtualOutput';

const hostMessagePrefix = '__auteura_virtual_output_host__';
const hostResponsePrefix = '__auteura_virtual_output_host_response__';
const extensionMarkerSelector = 'meta[name="auteura-extension-id"]';
const initialRegistrationRetryDelayMs = 1500;
const maxRegistrationRetryDelayMs = 10000;
const heartbeatIntervalMs = 5000;
const heartbeatTimeoutMs = 15000;
const throttledHeartbeatDriftGraceMs = heartbeatTimeoutMs;
const maxInboundMessageAgeMs = 60_000;

interface BridgePeerSession {
  readonly clientId: string;
  readonly connection: RTCPeerConnection;
  readonly sessionId: string;
  readonly sourceStream: MediaStream;
  readonly request: VirtualOutputClientRequest;
  readonly senderTrackIds: Set<string>;
}

interface BridgeWindowMessage {
  readonly [hostMessagePrefix]?: true;
  readonly [hostResponsePrefix]?: true;
  readonly [key: string]: unknown;
}

interface AuteuraVirtualOutputBridgeServiceDependencies {
  readonly createPeerConnection?: () => RTCPeerConnection;
  readonly now?: () => number;
  readonly windowObject?: Window;
}

function defaultCreatePeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection();
}

function defaultNow(): number {
  return Date.now();
}

function isAllowedHostInboundType(type: VirtualOutputSignalMessage['type']): boolean {
  return [
    'ANSWER',
    'CLIENT_DISCONNECTED',
    'ERROR',
    'HANDSHAKE_INIT',
    'HOST_OFFLINE',
    'HOST_REGISTER_ACK',
    'ICE_CANDIDATE',
    'PONG',
  ].includes(type);
}

export class AuteuraVirtualOutputBridgeService {
  private readonly createPeerConnection: () => RTCPeerConnection;
  private readonly now: () => number;
  private readonly virtualOutputService: AuteuraVirtualOutputService;
  private readonly windowObject: Window;
  private readonly peerSessions = new Map<string, BridgePeerSession>();
  private hostId = 'auteura-browser-camera-host';
  private observer: MutationObserver | null = null;
  private isStarted = false;
  private heartbeatIntervalId: number | null = null;
  private heartbeatDeadlineAt: number | null = null;
  private pendingHeartbeatSessionId: string | null = null;
  private pendingRegistrationSessionId: string | null = null;
  private registrationRetryDelayMs = initialRegistrationRetryDelayMs;
  private registrationRetryTimeoutId: number | null = null;
  private lastHeartbeatPollAt: number | null = null;

  constructor(
    virtualOutputService: AuteuraVirtualOutputService,
    dependencies: AuteuraVirtualOutputBridgeServiceDependencies = {},
  ) {
    this.createPeerConnection =
      dependencies.createPeerConnection ?? defaultCreatePeerConnection;
    this.now = dependencies.now ?? defaultNow;
    this.virtualOutputService = virtualOutputService;
    this.windowObject = dependencies.windowObject ?? window;
  }

  start(): void {
    if (this.isStarted) {
      return;
    }

    this.isStarted = true;
    this.detectExtension();
    this.windowObject.addEventListener('message', this.handleWindowMessage);
    this.windowObject.document.addEventListener('visibilitychange', this.handleVisibilityChange);

    const MutationObserverCtor = (
      this.windowObject as Window & {
        MutationObserver?: typeof MutationObserver;
      }
    ).MutationObserver;

    if (typeof MutationObserverCtor === 'function') {
      this.observer = new MutationObserverCtor((): void => {
        this.detectExtension();
      });
      this.observer?.observe(
        this.windowObject.document.documentElement,
        { childList: true, subtree: true },
      );
    }

    this.startHeartbeatLoop();
  }

  stop(): void {
    if (!this.isStarted) {
      return;
    }

    this.isStarted = false;
    this.observer?.disconnect();
    this.observer = null;
    this.windowObject.removeEventListener('message', this.handleWindowMessage);
    this.windowObject.document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.clearHeartbeatLoop();
    this.clearRegistrationRetry();
    this.closeAllPeerSessions();
    this.virtualOutputService.reportHostRegistration(false);
  }

  private readonly handleWindowMessage = (event: MessageEvent): void => {
    if (event.source !== this.windowObject || event.origin !== this.windowObject.location.origin) {
      return;
    }

    const incomingData = event.data as BridgeWindowMessage | null;
    if (incomingData?.[hostResponsePrefix] !== true) {
      return;
    }

    const payload = Object.fromEntries(
      Object.entries(incomingData).filter(([key]): boolean => key !== hostResponsePrefix),
    );

    if (!isVirtualOutputMessage(payload)) {
      this.virtualOutputService.reportError(
        'Virtual output bridge received an invalid message.',
      );
      return;
    }

    const message = parseVirtualOutputMessage(payload);

    if (
      !isAllowedHostInboundType(message.type) ||
      Math.abs(this.now() - message.timestamp) > maxInboundMessageAgeMs
    ) {
      this.virtualOutputService.reportError('Virtual output bridge rejected a stale or unsupported message.');
      return;
    }

    this.virtualOutputService.reportHeartbeat(message.timestamp);
    void this.handleProtocolMessage(message);
  };

  private async handleProtocolMessage(message: VirtualOutputSignalMessage): Promise<void> {
    switch (message.type) {
      case 'HOST_REGISTER_ACK':
        if (message.sessionId !== this.pendingRegistrationSessionId) {
          return;
        }

        this.hostId = message.hostId;
        this.virtualOutputService.reportHostRegistration(true);
        this.pendingRegistrationSessionId = null;
        this.registrationRetryDelayMs = initialRegistrationRetryDelayMs;
        this.clearRegistrationRetry();
        this.clearPendingHeartbeat();
        return;
      case 'HANDSHAKE_INIT':
        await this.handleHandshakeInit(message.clientId, message.sessionId, message.request);
        return;
      case 'ANSWER':
        await this.handleAnswer(message.clientId, message.sessionId, message.sdp);
        return;
      case 'ICE_CANDIDATE':
        await this.handleIceCandidate(message);
        return;
      case 'CLIENT_DISCONNECTED':
        this.closePeerSession(message.clientId);
        return;
      case 'HOST_OFFLINE':
        this.closeAllPeerSessions();
        this.virtualOutputService.reportHostRegistration(false);
        this.virtualOutputService.reportError(message.reason ?? 'Auteura browser camera host went offline.');
        this.scheduleRegistrationRetry();
        return;
      case 'ERROR':
        this.virtualOutputService.reportError(message.message);
        if (message.code === 'BRIDGE_UNAVAILABLE') {
          this.virtualOutputService.reportHostRegistration(false);
          this.scheduleRegistrationRetry();
        }
        return;
      case 'PONG':
        if (message.sessionId !== this.pendingHeartbeatSessionId || message.actorId !== this.hostId) {
          return;
        }

        this.pendingHeartbeatSessionId = null;
        this.registrationRetryDelayMs = initialRegistrationRetryDelayMs;
        this.clearPendingHeartbeat();
        return;
      default:
        return;
    }
  }

  private detectExtension(): void {
    const marker = this.windowObject.document.querySelector(extensionMarkerSelector);
    const detected = marker !== null;
    this.virtualOutputService.reportExtensionDetected(detected);

    if (detected) {
      this.registerHost();
      return;
    }

    this.pendingRegistrationSessionId = null;
    this.clearPendingHeartbeat();
    this.registrationRetryDelayMs = initialRegistrationRetryDelayMs;
    this.clearRegistrationRetry();
    this.closeAllPeerSessions();
  }

  private registerHost(): void {
    if (!this.isStarted || !this.virtualOutputService.getStatusSnapshot().extensionDetected) {
      return;
    }

    const outputStream = this.virtualOutputService.getOutputStream();
    const primaryVideoTrack = outputStream?.getVideoTracks()[0] ?? null;
    const primaryAudioTrack = outputStream?.getAudioTracks()[0] ?? null;
    const videoSettings = primaryVideoTrack?.getSettings?.() ?? {};
    const status = this.virtualOutputService.getStatusSnapshot();

    const sessionId = crypto.randomUUID();
    this.pendingRegistrationSessionId = sessionId;

    this.postHostMessage({
      ...createVirtualOutputMessageEnvelope('HOST_REGISTER', sessionId, this.now()),
      capabilities: {
        hasAudio: primaryAudioTrack !== null,
        maxFrameRate: Math.max(1, Math.round(status.targetFps || 15)),
        maxHeight: Math.max(1, Math.round(videoSettings.height ?? 1080)),
        maxWidth: Math.max(1, Math.round(videoSettings.width ?? 1920)),
      },
      hostId: this.hostId,
      type: 'HOST_REGISTER',
    });
  }

  private startHeartbeatLoop(): void {
    if (this.heartbeatIntervalId !== null) {
      return;
    }

    this.lastHeartbeatPollAt = this.now();
    this.heartbeatIntervalId = this.windowObject.setInterval((): void => {
      const currentTime = this.now();
      const status = this.virtualOutputService.getStatusSnapshot();

      const previousPollAt = this.lastHeartbeatPollAt;
      this.lastHeartbeatPollAt = currentTime;

      if (!this.isStarted || !status.extensionDetected || !status.hostRegistered) {
        this.clearPendingHeartbeat();
        return;
      }

      if (this.windowObject.document.visibilityState === 'hidden') {
        this.clearPendingHeartbeat();
        return;
      }

      if (
        previousPollAt !== null &&
        currentTime - previousPollAt > heartbeatIntervalMs + throttledHeartbeatDriftGraceMs
      ) {
        this.clearPendingHeartbeat();
      }

      if (this.pendingHeartbeatSessionId !== null) {
        if (this.heartbeatDeadlineAt !== null && currentTime >= this.heartbeatDeadlineAt) {
          this.clearPendingHeartbeat();
          this.virtualOutputService.reportHostRegistration(false);
          this.virtualOutputService.reportError(
            'Auteura browser-camera bridge heartbeat timed out.',
          );
          this.closeAllPeerSessions();
          this.scheduleRegistrationRetry();
        }
        return;
      }

      const sessionId = `ping-${crypto.randomUUID()}`;
      this.pendingHeartbeatSessionId = sessionId;
      this.heartbeatDeadlineAt = currentTime + heartbeatTimeoutMs;
      this.postHostMessage({
        ...createVirtualOutputMessageEnvelope('PING', sessionId, currentTime),
        actorId: this.hostId,
        type: 'PING',
      });
    }, heartbeatIntervalMs);
  }

  private clearHeartbeatLoop(): void {
    if (this.heartbeatIntervalId !== null) {
      this.windowObject.clearInterval(this.heartbeatIntervalId);
      this.heartbeatIntervalId = null;
    }

    this.clearPendingHeartbeat();
    this.lastHeartbeatPollAt = null;
  }

  private clearPendingHeartbeat(): void {
    this.pendingHeartbeatSessionId = null;
    this.heartbeatDeadlineAt = null;
  }

  private scheduleRegistrationRetry(): void {
    if (
      this.registrationRetryTimeoutId !== null ||
      !this.isStarted ||
      !this.virtualOutputService.getStatusSnapshot().extensionDetected
    ) {
      return;
    }

    this.registrationRetryTimeoutId = this.windowObject.setTimeout((): void => {
      this.registrationRetryTimeoutId = null;
      this.registerHost();
    }, this.registrationRetryDelayMs);
    this.registrationRetryDelayMs = Math.min(
      this.registrationRetryDelayMs * 2,
      maxRegistrationRetryDelayMs,
    );
  }

  private clearRegistrationRetry(): void {
    if (this.registrationRetryTimeoutId !== null) {
      this.windowObject.clearTimeout(this.registrationRetryTimeoutId);
      this.registrationRetryTimeoutId = null;
    }
  }

  private readonly handleVisibilityChange = (): void => {
    if (!this.isStarted) {
      return;
    }

    if (this.windowObject.document.visibilityState === 'hidden') {
      this.clearPendingHeartbeat();
      return;
    }

    this.lastHeartbeatPollAt = this.now();

    if (
      this.virtualOutputService.getStatusSnapshot().extensionDetected &&
      !this.virtualOutputService.getStatusSnapshot().hostRegistered
    ) {
      this.scheduleRegistrationRetry();
    }
  };

  private async handleHandshakeInit(
    clientId: string,
    sessionId: string,
    request: VirtualOutputClientRequest,
  ): Promise<void> {
    this.closePeerSession(clientId);
    this.virtualOutputService.reportBridgeEvent(
      `Handshake requested for ${clientId} (${request.audio ? 'av' : 'video-only'}).`,
    );

    const outputStream = this.virtualOutputService.createClientOutputStream(clientId, {
      includeAudio: request.audio,
      includeVideo: true,
    });
    if (outputStream === null) {
      this.virtualOutputService.reportError('Virtual output stream is not ready for browser-camera handshake.');
      return;
    }

    const connection = this.createPeerConnection();
    const senderTrackIds = new Set<string>();

    connection.onicecandidate = (event: RTCPeerConnectionIceEvent): void => {
      this.postHostMessage({
        ...createVirtualOutputMessageEnvelope('ICE_CANDIDATE', sessionId, this.now()),
        candidate: event.candidate?.toJSON?.() ?? null,
        clientId,
        from: 'host',
        type: 'ICE_CANDIDATE',
      });
    };

    this.addTracksToConnection(connection, outputStream, request, senderTrackIds);
    const session: BridgePeerSession = {
      clientId,
      connection,
      request,
      sourceStream: outputStream,
      senderTrackIds,
      sessionId,
    };
    this.peerSessions.set(clientId, session);
    this.virtualOutputService.reportClientCount(this.peerSessions.size);
    this.virtualOutputService.reportBridgeEvent(
      `Offer setup started for ${clientId} with ${outputStream.getVideoTracks().length} video / ${outputStream.getAudioTracks().length} audio tracks.`,
    );

    try {
      const offer = await connection.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
      });
      await connection.setLocalDescription(offer);
      this.virtualOutputService.reportBridgeEvent(`Offer created for ${clientId}.`);

      this.postHostMessage({
        ...createVirtualOutputMessageEnvelope('OFFER', sessionId, this.now()),
        clientId,
        sdp: offer,
        type: 'OFFER',
      });
    } catch (error: unknown) {
      this.closePeerSession(clientId);
      this.virtualOutputService.reportError(
        error instanceof Error ? error.message : 'Failed to create browser-camera WebRTC offer.',
      );
    }
  }

  private addTracksToConnection(
    connection: RTCPeerConnection,
    outputStream: MediaStream,
    request: VirtualOutputClientRequest,
    senderTrackIds: Set<string>,
  ): void {
    outputStream.getVideoTracks().forEach((track: MediaStreamTrack): void => {
      connection.addTrack(track, outputStream);
      senderTrackIds.add(track.id);
    });

    if (!request.audio) {
      return;
    }

    outputStream.getAudioTracks().forEach((track: MediaStreamTrack): void => {
      connection.addTrack(track, outputStream);
      senderTrackIds.add(track.id);
    });
  }

  private async handleAnswer(
    clientId: string,
    sessionId: string,
    sdp: RTCSessionDescriptionInit,
  ): Promise<void> {
    const session = this.peerSessions.get(clientId);
    if (session === undefined || session.sessionId !== sessionId) {
      return;
    }

    try {
      await session.connection.setRemoteDescription(sdp);
      this.virtualOutputService.reportBridgeEvent(`Answer applied for ${clientId}.`);
    } catch (error: unknown) {
      this.closePeerSession(clientId);
      this.virtualOutputService.reportError(
        error instanceof Error ? error.message : 'Failed to apply browser-camera answer.',
      );
    }
  }

  private async handleIceCandidate(message: VirtualOutputIceCandidateMessage): Promise<void> {
    if (message.from !== 'client') {
      return;
    }

    const session = this.peerSessions.get(message.clientId);
    if (session === undefined || session.sessionId !== message.sessionId) {
      return;
    }

    try {
      await session.connection.addIceCandidate(message.candidate);
      this.virtualOutputService.reportBridgeEvent(`ICE candidate applied for ${message.clientId}.`);
    } catch (error: unknown) {
      this.virtualOutputService.reportError(
        error instanceof Error ? error.message : 'Failed to apply browser-camera ICE candidate.',
      );
    }
  }

  private closePeerSession(clientId: string): void {
    const session = this.peerSessions.get(clientId);
    if (session === undefined) {
      return;
    }

    session.connection.onicecandidate = null;
    session.connection.close();
    this.virtualOutputService.releaseClientOutputStream(clientId);
    this.peerSessions.delete(clientId);
    this.virtualOutputService.reportClientCount(this.peerSessions.size);
    this.virtualOutputService.reportBridgeEvent(`Client ${clientId} disconnected.`);
  }

  private closeAllPeerSessions(): void {
    [...this.peerSessions.keys()].forEach((clientId): void => {
      this.closePeerSession(clientId);
    });
  }

  private postHostMessage(message: VirtualOutputOfferMessage | VirtualOutputSignalMessage): void {
    this.windowObject.postMessage(
      {
        [hostMessagePrefix]: true,
        ...message,
      },
      this.windowObject.location.origin,
    );
  }
}
