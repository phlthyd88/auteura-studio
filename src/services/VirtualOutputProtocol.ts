import {
  type VirtualOutputClientRequest,
  virtualOutputProtocolName,
  virtualOutputProtocolVersion,
  type VirtualOutputErrorCode,
  type VirtualOutputHostCapabilities,
  type VirtualOutputSignalMessage,
  type VirtualOutputSignalType,
} from '../types/virtualOutput';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseRequiredString(
  value: unknown,
  fieldName: string,
): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Virtual output message field "${fieldName}" must be a non-empty string.`);
  }

  return value;
}

function parseRequiredNumber(
  value: unknown,
  fieldName: string,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Virtual output message field "${fieldName}" must be a finite number.`);
  }

  return value;
}

function parseRequiredBoolean(
  value: unknown,
  fieldName: string,
): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Virtual output message field "${fieldName}" must be a boolean.`);
  }

  return value;
}

function parseSignalBase(
  value: unknown,
): {
  readonly protocol: typeof virtualOutputProtocolName;
  readonly protocolVersion: typeof virtualOutputProtocolVersion;
  readonly sessionId: string;
  readonly timestamp: number;
  readonly type: VirtualOutputSignalType;
} {
  if (!isRecord(value)) {
    throw new Error('Virtual output message must be an object.');
  }

  if (value.protocol !== virtualOutputProtocolName) {
    throw new Error('Virtual output message protocol is unsupported.');
  }

  if (value.protocolVersion !== virtualOutputProtocolVersion) {
    throw new Error('Virtual output message protocol version is unsupported.');
  }

  const type = parseRequiredString(value.type, 'type') as VirtualOutputSignalType;

  return {
    protocol: virtualOutputProtocolName,
    protocolVersion: virtualOutputProtocolVersion,
    sessionId: parseRequiredString(value.sessionId, 'sessionId'),
    timestamp: parseRequiredNumber(value.timestamp, 'timestamp'),
    type,
  };
}

function parseHostCapabilities(value: unknown): VirtualOutputHostCapabilities {
  if (!isRecord(value)) {
    throw new Error('Virtual output host capabilities are malformed.');
  }

  return {
    hasAudio: parseRequiredBoolean(value.hasAudio, 'capabilities.hasAudio'),
    maxFrameRate: parseRequiredNumber(value.maxFrameRate, 'capabilities.maxFrameRate'),
    maxHeight: parseRequiredNumber(value.maxHeight, 'capabilities.maxHeight'),
    maxWidth: parseRequiredNumber(value.maxWidth, 'capabilities.maxWidth'),
  };
}

function parseClientRequest(
  value: unknown,
): VirtualOutputClientRequest {
  if (!isRecord(value)) {
    throw new Error('Virtual output client request is malformed.');
  }

  const width =
    value.width === undefined ? undefined : parseRequiredNumber(value.width, 'request.width');
  const height =
    value.height === undefined ? undefined : parseRequiredNumber(value.height, 'request.height');
  const frameRate =
    value.frameRate === undefined
      ? undefined
      : parseRequiredNumber(value.frameRate, 'request.frameRate');

  return {
    audio: parseRequiredBoolean(value.audio, 'request.audio'),
    ...(frameRate === undefined ? {} : { frameRate }),
    ...(height === undefined ? {} : { height }),
    ...(width === undefined ? {} : { width }),
  };
}

function parseSdp(value: unknown): RTCSessionDescriptionInit {
  if (!isRecord(value)) {
    throw new Error('Virtual output session description is malformed.');
  }

  return {
    sdp: parseRequiredString(value.sdp, 'sdp.sdp'),
    type: parseRequiredString(value.type, 'sdp.type') as RTCSdpType,
  };
}

function parseIceCandidate(value: unknown): RTCIceCandidateInit | null {
  if (value === null) {
    return null;
  }

  if (!isRecord(value)) {
    throw new Error('Virtual output ICE candidate is malformed.');
  }

  const candidate = parseRequiredString(value.candidate, 'candidate.candidate');
  const sdpMid =
    value.sdpMid === undefined ? undefined : parseRequiredString(value.sdpMid, 'candidate.sdpMid');
  const sdpMLineIndex =
    value.sdpMLineIndex === undefined
      ? undefined
      : parseRequiredNumber(value.sdpMLineIndex, 'candidate.sdpMLineIndex');

  return {
    candidate,
    ...(sdpMLineIndex === undefined ? {} : { sdpMLineIndex }),
    ...(sdpMid === undefined ? {} : { sdpMid }),
  };
}

export function parseVirtualOutputMessage(value: unknown): VirtualOutputSignalMessage {
  const base = parseSignalBase(value);
  const record = value as Record<string, unknown>;

  switch (base.type) {
    case 'HOST_REGISTER':
      return {
        ...base,
        capabilities: parseHostCapabilities(record.capabilities),
        hostId: parseRequiredString(record.hostId, 'hostId'),
        type: 'HOST_REGISTER',
      };
    case 'HOST_REGISTER_ACK':
      return {
        ...base,
        hostId: parseRequiredString(record.hostId, 'hostId'),
        type: 'HOST_REGISTER_ACK',
      };
    case 'CLIENT_REGISTER':
      return {
        ...base,
        clientId: parseRequiredString(record.clientId, 'clientId'),
        pageOrigin: parseRequiredString(record.pageOrigin, 'pageOrigin'),
        type: 'CLIENT_REGISTER',
      };
    case 'HANDSHAKE_INIT':
      {
        const clientRequest = parseClientRequest(record.request);

      return {
        ...base,
        clientId: parseRequiredString(record.clientId, 'clientId'),
        request: clientRequest,
        type: 'HANDSHAKE_INIT',
      };
      }
    case 'OFFER':
      return {
        ...base,
        clientId: parseRequiredString(record.clientId, 'clientId'),
        sdp: parseSdp(record.sdp),
        type: 'OFFER',
      };
    case 'ANSWER':
      return {
        ...base,
        clientId: parseRequiredString(record.clientId, 'clientId'),
        sdp: parseSdp(record.sdp),
        type: 'ANSWER',
      };
    case 'ICE_CANDIDATE':
      return {
        ...base,
        candidate: parseIceCandidate(record.candidate),
        clientId: parseRequiredString(record.clientId, 'clientId'),
        from: parseRequiredString(record.from, 'from') as 'client' | 'host',
        type: 'ICE_CANDIDATE',
      };
    case 'PING':
      return {
        ...base,
        actorId: parseRequiredString(record.actorId, 'actorId'),
        type: 'PING',
      };
    case 'PONG':
      return {
        ...base,
        actorId: parseRequiredString(record.actorId, 'actorId'),
        type: 'PONG',
      };
    case 'HOST_OFFLINE':
      return {
        ...base,
        ...(record.reason === undefined
          ? {}
          : { reason: parseRequiredString(record.reason, 'reason') }),
        type: 'HOST_OFFLINE',
      };
    case 'CLIENT_DISCONNECTED':
      return {
        ...base,
        clientId: parseRequiredString(record.clientId, 'clientId'),
        type: 'CLIENT_DISCONNECTED',
      };
    case 'ERROR':
      return {
        ...base,
        code: parseRequiredString(record.code, 'code') as VirtualOutputErrorCode,
        ...(record.details === undefined
          ? {}
          : { details: parseRequiredString(record.details, 'details') }),
        message: parseRequiredString(record.message, 'message'),
        type: 'ERROR',
      };
    default:
      throw new Error('Virtual output message type is unsupported.');
  }
}

export function isVirtualOutputMessage(value: unknown): value is VirtualOutputSignalMessage {
  try {
    parseVirtualOutputMessage(value);
    return true;
  } catch {
    return false;
  }
}

export function createVirtualOutputMessageEnvelope(
  type: VirtualOutputSignalType,
  sessionId: string,
  timestamp: number = Date.now(),
): {
  readonly protocol: typeof virtualOutputProtocolName;
  readonly protocolVersion: typeof virtualOutputProtocolVersion;
  readonly sessionId: string;
  readonly timestamp: number;
  readonly type: VirtualOutputSignalType;
} {
  return {
    protocol: virtualOutputProtocolName,
    protocolVersion: virtualOutputProtocolVersion,
    sessionId,
    timestamp,
    type,
  };
}
