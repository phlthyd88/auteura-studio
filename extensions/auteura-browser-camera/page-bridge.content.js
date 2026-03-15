(function () {
  'use strict';

  const CLIENT_PORT_NAME = 'auteura-browser-camera-client';
  const MESSAGE_PREFIX = '__auteura_virtual_output_page__';
  const RESPONSE_PREFIX = '__auteura_virtual_output_page_response__';
  const BRIDGE_SESSION_ID = 'bridge';
  const INITIAL_RECONNECT_DELAY_MS = 1200;
  const MAX_RECONNECT_DELAY_MS = 8000;
  const MAX_MESSAGE_AGE_MS = 60_000;

  /** @type {chrome.runtime.Port | null} */
  let port = null;
  /** @type {number | null} */
  let reconnectTimeoutId = null;
  let reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
  let extensionContextInvalidated = false;

  function isRecord(value) {
    return typeof value === 'object' && value !== null;
  }

  function isFreshTimestamp(value) {
    return (
      typeof value === 'number' &&
      Number.isFinite(value) &&
      Math.abs(Date.now() - value) <= MAX_MESSAGE_AGE_MS
    );
  }

  function isAllowedPageOutboundType(type) {
    return ['ANSWER', 'HANDSHAKE_INIT', 'ICE_CANDIDATE', 'PING'].includes(type);
  }

  function isAllowedPageInboundType(type) {
    return ['CLIENT_REGISTER', 'ERROR', 'HOST_OFFLINE', 'ICE_CANDIDATE', 'OFFER', 'PONG'].includes(type);
  }

  function isValidProtocolMessage(message) {
    return (
      isRecord(message) &&
      message.protocol === 'auteura-virtual-output' &&
      message.protocolVersion === 1 &&
      typeof message.type === 'string' &&
      typeof message.sessionId === 'string' &&
      message.sessionId.length > 0 &&
      isFreshTimestamp(message.timestamp)
    );
  }

  function postBridgeUnavailable(message) {
    window.postMessage(
      {
        [RESPONSE_PREFIX]: true,
        code: 'BRIDGE_UNAVAILABLE',
        message,
        protocol: 'auteura-virtual-output',
        protocolVersion: 1,
        sessionId: BRIDGE_SESSION_ID,
        timestamp: Date.now(),
        type: 'ERROR',
      },
      window.location.origin,
    );
  }

  function invalidateExtensionContext() {
    extensionContextInvalidated = true;

    if (reconnectTimeoutId !== null) {
      window.clearTimeout(reconnectTimeoutId);
      reconnectTimeoutId = null;
    }

    port = null;
    postBridgeUnavailable(
      'Auteura browser-camera extension was reloaded. Refresh the meeting tab to reconnect the page bridge.',
    );
  }

  function ensurePort() {
    if (port !== null || extensionContextInvalidated) {
      return port;
    }

    if (reconnectTimeoutId !== null) {
      window.clearTimeout(reconnectTimeoutId);
      reconnectTimeoutId = null;
    }

    try {
      port = chrome.runtime.connect({ name: CLIENT_PORT_NAME });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('Extension context invalidated')
      ) {
        invalidateExtensionContext();
        return null;
      }

      throw error;
    }
    reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;

    port.onMessage.addListener((message) => {
      if (!isValidProtocolMessage(message) || !isAllowedPageInboundType(message.type)) {
        return;
      }

      window.postMessage(
        {
          [RESPONSE_PREFIX]: true,
          ...message,
        },
        window.location.origin,
      );
    });

    port.onDisconnect.addListener(() => {
      port = null;
      postBridgeUnavailable('Auteura browser-camera bridge is offline.');
      reconnectTimeoutId = window.setTimeout(() => {
        reconnectTimeoutId = null;
        ensurePort();
      }, reconnectDelayMs);
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
    });

    port.postMessage({
      pageOrigin: window.location.origin,
      protocol: 'auteura-virtual-output',
      protocolVersion: 1,
      sessionId: BRIDGE_SESSION_ID,
      timestamp: Date.now(),
      type: 'CLIENT_REGISTER',
    });

    return port;
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) {
      return;
    }

    if (event.data?.[MESSAGE_PREFIX] !== true) {
      return;
    }

    const payload = Object.fromEntries(
      Object.entries(event.data).filter(([key]) => key !== MESSAGE_PREFIX),
    );

    if (!isValidProtocolMessage(payload) || !isAllowedPageOutboundType(payload.type)) {
      return;
    }

    const activePort = ensurePort();
    activePort?.postMessage(payload);
  });

  ensurePort();
})();
