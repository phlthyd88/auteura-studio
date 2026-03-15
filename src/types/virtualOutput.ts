export type VirtualOutputState = 'idle' | 'starting' | 'ready' | 'error';
export type VirtualOutputBridgeState = 'unavailable' | 'detected' | 'registered';

export const virtualOutputProtocolName = 'auteura-virtual-output';
export const virtualOutputProtocolVersion = 1;

export type VirtualOutputSignalType =
  | 'ANSWER'
  | 'CLIENT_DISCONNECTED'
  | 'CLIENT_REGISTER'
  | 'ERROR'
  | 'HANDSHAKE_INIT'
  | 'HOST_OFFLINE'
  | 'HOST_REGISTER'
  | 'HOST_REGISTER_ACK'
  | 'ICE_CANDIDATE'
  | 'OFFER'
  | 'PING'
  | 'PONG';

export type VirtualOutputErrorCode =
  | 'BRIDGE_UNAVAILABLE'
  | 'CLIENT_NOT_FOUND'
  | 'INVALID_MESSAGE'
  | 'PROTOCOL_MISMATCH'
  | 'SESSION_NOT_FOUND'
  | 'UNSUPPORTED_CAPABILITY';

export interface VirtualOutputHostCapabilities {
  readonly hasAudio: boolean;
  readonly maxFrameRate: number;
  readonly maxHeight: number;
  readonly maxWidth: number;
}

export interface VirtualOutputClientRequest {
  readonly audio: boolean;
  readonly frameRate?: number;
  readonly height?: number;
  readonly width?: number;
}

interface VirtualOutputSignalBase {
  readonly protocol: typeof virtualOutputProtocolName;
  readonly protocolVersion: typeof virtualOutputProtocolVersion;
  readonly sessionId: string;
  readonly timestamp: number;
  readonly type: VirtualOutputSignalType;
}

export interface VirtualOutputHostRegisterMessage extends VirtualOutputSignalBase {
  readonly capabilities: VirtualOutputHostCapabilities;
  readonly hostId: string;
  readonly type: 'HOST_REGISTER';
}

export interface VirtualOutputHostRegisterAckMessage extends VirtualOutputSignalBase {
  readonly hostId: string;
  readonly type: 'HOST_REGISTER_ACK';
}

export interface VirtualOutputClientRegisterMessage extends VirtualOutputSignalBase {
  readonly clientId: string;
  readonly pageOrigin: string;
  readonly type: 'CLIENT_REGISTER';
}

export interface VirtualOutputHandshakeInitMessage extends VirtualOutputSignalBase {
  readonly clientId: string;
  readonly request: VirtualOutputClientRequest;
  readonly type: 'HANDSHAKE_INIT';
}

export interface VirtualOutputOfferMessage extends VirtualOutputSignalBase {
  readonly clientId: string;
  readonly sdp: RTCSessionDescriptionInit;
  readonly type: 'OFFER';
}

export interface VirtualOutputAnswerMessage extends VirtualOutputSignalBase {
  readonly clientId: string;
  readonly sdp: RTCSessionDescriptionInit;
  readonly type: 'ANSWER';
}

export interface VirtualOutputIceCandidateMessage extends VirtualOutputSignalBase {
  readonly candidate: RTCIceCandidateInit | null;
  readonly clientId: string;
  readonly from: 'client' | 'host';
  readonly type: 'ICE_CANDIDATE';
}

export interface VirtualOutputPingMessage extends VirtualOutputSignalBase {
  readonly actorId: string;
  readonly type: 'PING';
}

export interface VirtualOutputPongMessage extends VirtualOutputSignalBase {
  readonly actorId: string;
  readonly type: 'PONG';
}

export interface VirtualOutputHostOfflineMessage extends VirtualOutputSignalBase {
  readonly reason?: string;
  readonly type: 'HOST_OFFLINE';
}

export interface VirtualOutputClientDisconnectedMessage extends VirtualOutputSignalBase {
  readonly clientId: string;
  readonly type: 'CLIENT_DISCONNECTED';
}

export interface VirtualOutputErrorMessage extends VirtualOutputSignalBase {
  readonly code: VirtualOutputErrorCode;
  readonly details?: string;
  readonly message: string;
  readonly type: 'ERROR';
}

export type VirtualOutputSignalMessage =
  | VirtualOutputAnswerMessage
  | VirtualOutputClientDisconnectedMessage
  | VirtualOutputClientRegisterMessage
  | VirtualOutputErrorMessage
  | VirtualOutputHandshakeInitMessage
  | VirtualOutputHostOfflineMessage
  | VirtualOutputHostRegisterAckMessage
  | VirtualOutputHostRegisterMessage
  | VirtualOutputIceCandidateMessage
  | VirtualOutputOfferMessage
  | VirtualOutputPingMessage
  | VirtualOutputPongMessage;

export interface VirtualOutputStatusSnapshot {
  readonly bridgeState: VirtualOutputBridgeState;
  readonly clientCount: number;
  readonly deliveryProfile: 'balanced' | 'full' | 'safe';
  readonly extensionDetected: boolean;
  readonly hasAudio: boolean;
  readonly hasVideo: boolean;
  readonly hostRegistered: boolean;
  readonly lastBridgeEvent: string | null;
  readonly lastError: string | null;
  readonly lastHeartbeatAt: number | null;
  readonly leasedStreamCount: number;
  readonly state: VirtualOutputState;
  readonly targetFps: number;
}

export interface VirtualOutputStartOptions {
  readonly audioEnabled?: boolean;
  readonly audioStream?: MediaStream | null;
  readonly canvas: HTMLCanvasElement;
  readonly targetFps: number;
}

export const defaultVirtualOutputStatus: VirtualOutputStatusSnapshot = {
  bridgeState: 'unavailable',
  clientCount: 0,
  deliveryProfile: 'safe',
  extensionDetected: false,
  hasAudio: false,
  hasVideo: false,
  hostRegistered: false,
  lastBridgeEvent: null,
  lastError: null,
  lastHeartbeatAt: null,
  leasedStreamCount: 0,
  state: 'idle',
  targetFps: 0,
};
