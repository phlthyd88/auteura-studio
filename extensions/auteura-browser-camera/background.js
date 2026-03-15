const CLIENT_PORT_NAME = 'auteura-browser-camera-client';
const HOST_PORT_NAME = 'auteura-browser-camera-host';
const HOST_BRIDGE_SCRIPT_ID = 'auteura-browser-camera-host-bridge';
const PAGE_BRIDGE_SCRIPT_ID = 'auteura-browser-camera-page-bridge';
const PAGE_SHIM_SCRIPT_ID = 'auteura-browser-camera-page-shim';
const PROTOCOL = 'auteura-virtual-output';
const PROTOCOL_VERSION = 1;
const BRIDGE_SESSION_ID = 'bridge';
const MAX_MESSAGE_AGE_MS = 60_000;
const MEET_INTEGRATION_MODE_STORAGE_KEY = 'meetIntegrationMode';
const FULL_MEET_INTEGRATION_MODE = 'full';
const BRIDGE_ONLY_MEET_INTEGRATION_MODE = 'bridge-only';

const meetMatches = ['https://meet.google.com/*'];
const hostMatches = [
  'http://localhost/*',
  'http://127.0.0.1/*',
  'https://localhost/*',
  'https://127.0.0.1/*',
];

/** @type {chrome.runtime.Port | null} */
let hostPort = null;
let hostActorId = 'auteura-browser-camera-host';
/** @type {Promise<void> | null} */
let contentScriptRegistrationPromise = null;

/** @type {Map<string, chrome.runtime.Port>} */
const clientPorts = new Map();

function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

function isAllowedHostUrl(url) {
  return /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\//u.test(url);
}

function isAllowedMeetUrl(url) {
  return /^https:\/\/meet\.google\.com\//u.test(url);
}

function isFreshTimestamp(value) {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Math.abs(Date.now() - value) <= MAX_MESSAGE_AGE_MS
  );
}

function isValidProtocolMessage(message) {
  return (
    isRecord(message) &&
    message.protocol === PROTOCOL &&
    message.protocolVersion === PROTOCOL_VERSION &&
    typeof message.type === 'string' &&
    typeof message.sessionId === 'string' &&
    message.sessionId.length > 0 &&
    isFreshTimestamp(message.timestamp)
  );
}

function isAllowedHostMessageType(type) {
  return ['HOST_REGISTER', 'ICE_CANDIDATE', 'OFFER', 'PING'].includes(type);
}

function isAllowedClientMessageType(type) {
  return ['ANSWER', 'HANDSHAKE_INIT', 'ICE_CANDIDATE', 'PING'].includes(type);
}

function getSenderUrl(port) {
  return port.sender?.url ?? port.sender?.documentUrl ?? '';
}

function isValidMeetIntegrationMode(value) {
  return value === FULL_MEET_INTEGRATION_MODE || value === BRIDGE_ONLY_MEET_INTEGRATION_MODE;
}

async function getMeetIntegrationMode() {
  const stored = await chrome.storage.local.get(MEET_INTEGRATION_MODE_STORAGE_KEY);
  const mode = stored?.[MEET_INTEGRATION_MODE_STORAGE_KEY];
  return isValidMeetIntegrationMode(mode) ? mode : FULL_MEET_INTEGRATION_MODE;
}

async function getRegisteredContentScriptIds() {
  const scripts = await chrome.scripting.getRegisteredContentScripts();
  return scripts.map((script) => script.id).sort();
}

async function registerContentScripts() {
  if (contentScriptRegistrationPromise !== null) {
    return contentScriptRegistrationPromise;
  }

  contentScriptRegistrationPromise = (async () => {
  const meetIntegrationMode = await getMeetIntegrationMode();
  const existingScripts = await chrome.scripting.getRegisteredContentScripts();
  const existingIds = new Set(existingScripts.map((script) => script.id));
  const desiredIds = new Set([
    HOST_BRIDGE_SCRIPT_ID,
    PAGE_BRIDGE_SCRIPT_ID,
  ]);

  if (meetIntegrationMode === FULL_MEET_INTEGRATION_MODE) {
    desiredIds.add(PAGE_SHIM_SCRIPT_ID);
  }

  const removableIds = existingScripts
    .map((script) => script.id)
    .filter((scriptId) => desiredIds.has(scriptId) === false);

  if (removableIds.length > 0) {
    await chrome.scripting.unregisterContentScripts({
      ids: removableIds,
    });
  }

  const scriptsToRegister = [];

  if (existingIds.has(HOST_BRIDGE_SCRIPT_ID) === false) {
    scriptsToRegister.push({
      allFrames: false,
      id: HOST_BRIDGE_SCRIPT_ID,
      js: ['host-bridge.content.js'],
      matches: hostMatches,
      persistAcrossSessions: true,
      runAt: 'document_start',
      world: 'ISOLATED',
    });
  }

  if (existingIds.has(PAGE_BRIDGE_SCRIPT_ID) === false) {
    scriptsToRegister.push({
      // Meet uses internal subframes that should not receive the browser-camera shim.
      allFrames: false,
      id: PAGE_BRIDGE_SCRIPT_ID,
      js: ['page-bridge.content.js'],
      matches: meetMatches,
      persistAcrossSessions: true,
      runAt: 'document_start',
      world: 'ISOLATED',
    });
  }

  if (
    meetIntegrationMode === FULL_MEET_INTEGRATION_MODE &&
    existingIds.has(PAGE_SHIM_SCRIPT_ID) === false
  ) {
    scriptsToRegister.push({
      // Restrict the MAIN-world override to the top Meet frame only.
      allFrames: false,
      id: PAGE_SHIM_SCRIPT_ID,
      js: ['page-shim.main.js'],
      matches: meetMatches,
      persistAcrossSessions: true,
      runAt: 'document_start',
      world: 'MAIN',
    });
  }

  if (scriptsToRegister.length > 0) {
    try {
      await chrome.scripting.registerContentScripts(scriptsToRegister);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('Duplicate script ID')
      ) {
        return;
      }

      throw error;
    }
  }
  })().finally(() => {
    contentScriptRegistrationPromise = null;
  });

  return contentScriptRegistrationPromise;
}

if (typeof globalThis === 'object') {
  globalThis.__AUTEURA_BROWSER_CAMERA_TEST_API__ = {
    registerContentScripts,
  };
}

chrome.runtime.onInstalled.addListener(() => {
  void registerContentScripts();
});

chrome.runtime.onStartup.addListener(() => {
  void registerContentScripts();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'GET_MEET_INTEGRATION_MODE') {
    void Promise.all([getMeetIntegrationMode(), getRegisteredContentScriptIds()]).then(
      ([mode, registeredScriptIds]) => {
        sendResponse({ mode, registeredScriptIds });
      },
    );
    return true;
  }

  if (message?.type === 'SET_MEET_INTEGRATION_MODE') {
    const requestedMode = message?.mode;
    const nextMode = isValidMeetIntegrationMode(requestedMode)
      ? requestedMode
      : FULL_MEET_INTEGRATION_MODE;

    void chrome.storage.local
      .set({
        [MEET_INTEGRATION_MODE_STORAGE_KEY]: nextMode,
      })
      .then(() => registerContentScripts())
      .then(() => getRegisteredContentScriptIds())
      .then((registeredScriptIds) => {
        sendResponse({ mode: nextMode, registeredScriptIds });
      });
    return true;
  }

  return false;
});

void registerContentScripts();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === HOST_PORT_NAME) {
    handleHostPort(port);
    return;
  }

  if (port.name === CLIENT_PORT_NAME) {
    handleClientPort(port);
    return;
  }

  port.disconnect();
});

function handleHostPort(port) {
  if (!isAllowedHostUrl(getSenderUrl(port))) {
    port.disconnect();
    return;
  }

  if (hostPort !== null) {
    sendToPort(port, {
      code: 'BRIDGE_UNAVAILABLE',
      details: 'Only one Auteura host registration is allowed in the scaffold.',
      message: 'Another Auteura browser-camera host is already connected.',
      protocol: PROTOCOL,
      protocolVersion: PROTOCOL_VERSION,
      sessionId: BRIDGE_SESSION_ID,
      timestamp: Date.now(),
      type: 'ERROR',
    });
    port.disconnect();
    return;
  }

  hostPort = port;

  port.onDisconnect.addListener(() => {
    if (hostPort === port) {
      hostPort = null;
    }

    broadcastToClients({
      protocol: PROTOCOL,
      protocolVersion: PROTOCOL_VERSION,
      reason: 'Host bridge disconnected.',
      sessionId: BRIDGE_SESSION_ID,
      timestamp: Date.now(),
      type: 'HOST_OFFLINE',
    });
  });

  port.onMessage.addListener((message) => {
    if (!isValidProtocolMessage(message) || !isAllowedHostMessageType(message.type)) {
      return;
    }

    if (message.type === 'HOST_REGISTER') {
      hostActorId = typeof message.hostId === 'string' ? message.hostId : hostActorId;
      sendToPort(port, {
        hostId: message.hostId,
        protocol: PROTOCOL,
        protocolVersion: PROTOCOL_VERSION,
        sessionId: message.sessionId,
        timestamp: Date.now(),
        type: 'HOST_REGISTER_ACK',
      });
      return;
    }

    if (message.type === 'PING') {
      sendToPort(port, {
        actorId: hostActorId,
        protocol: PROTOCOL,
        protocolVersion: PROTOCOL_VERSION,
        sessionId: message.sessionId,
        timestamp: Date.now(),
        type: 'PONG',
      });
      return;
    }

    if (typeof message.clientId === 'string') {
      const clientPort = clientPorts.get(message.clientId);

      if (clientPort !== undefined) {
        sendToPort(clientPort, message);
      }
    }
  });
}

function handleClientPort(port) {
  const senderUrl = getSenderUrl(port);
  if (!isAllowedMeetUrl(senderUrl)) {
    port.disconnect();
    return;
  }

  const clientId = crypto.randomUUID();
  clientPorts.set(clientId, port);

  port.onDisconnect.addListener(() => {
    clientPorts.delete(clientId);

    if (hostPort !== null) {
      sendToPort(hostPort, {
        clientId,
        protocol: PROTOCOL,
        protocolVersion: PROTOCOL_VERSION,
        sessionId: BRIDGE_SESSION_ID,
        timestamp: Date.now(),
        type: 'CLIENT_DISCONNECTED',
      });
    }
  });

  port.onMessage.addListener((message) => {
    if (!isValidProtocolMessage(message)) {
      return;
    }

    if (message.type === 'CLIENT_REGISTER') {
      if (
        typeof message.pageOrigin !== 'string' ||
        !senderUrl.startsWith(message.pageOrigin)
      ) {
        sendToPort(port, {
          code: 'INVALID_MESSAGE',
          details: 'Client registration origin did not match the sender origin.',
          message: 'Auteura browser-camera registration was rejected.',
          protocol: PROTOCOL,
          protocolVersion: PROTOCOL_VERSION,
          sessionId: BRIDGE_SESSION_ID,
          timestamp: Date.now(),
          type: 'ERROR',
        });
        return;
      }

      sendToPort(port, {
        ...message,
        clientId,
      });
      return;
    }

    if (!isAllowedClientMessageType(message.type)) {
      return;
    }

    if (message.type === 'PING') {
      sendToPort(port, {
        actorId: clientId,
        protocol: PROTOCOL,
        protocolVersion: PROTOCOL_VERSION,
        sessionId: message.sessionId,
        timestamp: Date.now(),
        type: 'PONG',
      });
      return;
    }

    if (hostPort !== null) {
      sendToPort(hostPort, {
        ...message,
        clientId,
      });
      return;
    }

    sendToPort(port, {
      code: 'BRIDGE_UNAVAILABLE',
      details: 'The Auteura host page is not connected yet.',
      message: 'Auteura host is offline.',
      protocol: PROTOCOL,
      protocolVersion: PROTOCOL_VERSION,
      sessionId:
        typeof message.sessionId === 'string' && message.sessionId !== ''
          ? message.sessionId
          : BRIDGE_SESSION_ID,
      timestamp: Date.now(),
      type: 'ERROR',
    });
  });
}

function broadcastToClients(message) {
  clientPorts.forEach((port) => {
    sendToPort(port, message);
  });
}

function sendToPort(port, message) {
  try {
    port.postMessage(message);
  } catch {
    // best-effort scaffold transport
  }
}
