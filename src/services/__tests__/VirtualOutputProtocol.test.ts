import { describe, expect, it } from 'vitest';
import {
  createVirtualOutputMessageEnvelope,
  isVirtualOutputMessage,
  parseVirtualOutputMessage,
} from '../VirtualOutputProtocol';
import {
  virtualOutputProtocolName,
  virtualOutputProtocolVersion,
} from '../../types/virtualOutput';

describe('VirtualOutputProtocol', (): void => {
  it('parses a valid host register message', (): void => {
    const message = parseVirtualOutputMessage({
      ...createVirtualOutputMessageEnvelope('HOST_REGISTER', 'session-1', 100),
      capabilities: {
        hasAudio: true,
        maxFrameRate: 30,
        maxHeight: 1080,
        maxWidth: 1920,
      },
      hostId: 'host-1',
    });

    expect(message.type).toBe('HOST_REGISTER');
    expect(message.protocol).toBe(virtualOutputProtocolName);
    expect(message.protocolVersion).toBe(virtualOutputProtocolVersion);

    if (message.type === 'HOST_REGISTER') {
      expect(message.capabilities.maxWidth).toBe(1920);
      expect(message.hostId).toBe('host-1');
    }
  });

  it('parses a valid handshake init message with client request metadata', (): void => {
    const message = parseVirtualOutputMessage({
      ...createVirtualOutputMessageEnvelope('HANDSHAKE_INIT', 'session-2', 200),
      clientId: 'client-1',
      request: {
        audio: true,
        frameRate: 24,
        height: 720,
        width: 1280,
      },
    });

    expect(message.type).toBe('HANDSHAKE_INIT');

    if (message.type === 'HANDSHAKE_INIT') {
      expect(message.request.audio).toBe(true);
      expect(message.request.frameRate).toBe(24);
      expect(message.request.width).toBe(1280);
    }
  });

  it('rejects malformed protocol envelopes', (): void => {
    expect((): void => {
      parseVirtualOutputMessage({
        protocol: 'wrong-protocol',
        protocolVersion: 1,
        sessionId: 'bad',
        timestamp: 0,
        type: 'PING',
      });
    }).toThrow('Virtual output message protocol is unsupported.');

    expect((): void => {
      parseVirtualOutputMessage({
        protocol: virtualOutputProtocolName,
        protocolVersion: 99,
        sessionId: 'bad',
        timestamp: 0,
        type: 'PING',
      });
    }).toThrow('Virtual output message protocol version is unsupported.');
  });

  it('rejects malformed payload fields and reports message validity', (): void => {
    expect((): void => {
      parseVirtualOutputMessage({
        ...createVirtualOutputMessageEnvelope('ICE_CANDIDATE', 'session-3', 300),
        candidate: {
          candidate: 42,
        },
        clientId: 'client-2',
        from: 'host',
      });
    }).toThrow('Virtual output message field "candidate.candidate" must be a non-empty string.');

    expect(
      isVirtualOutputMessage({
        ...createVirtualOutputMessageEnvelope('PONG', 'session-4', 400),
        actorId: 'bridge-1',
      }),
    ).toBe(true);
    expect(isVirtualOutputMessage({ type: 'PONG' })).toBe(false);
  });
});
