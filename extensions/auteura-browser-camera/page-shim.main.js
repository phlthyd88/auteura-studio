(function () {
  'use strict';

  if (window !== window.top) {
    return;
  }

  const DEVICE_ID = 'auteura-browser-camera-preview';
  const DEVICE_LABEL = 'Auteura Browser Camera';
  const GROUP_ID = 'auteura-browser-camera-group';
  const MESSAGE_PREFIX = '__auteura_virtual_output_page__';
  const RESPONSE_PREFIX = '__auteura_virtual_output_page_response__';
  const PROTOCOL = 'auteura-virtual-output';
  const PROTOCOL_VERSION = 1;
  const REQUEST_TIMEOUT_MS = 8000;
  const INITIAL_REQUEST_RETRY_DELAY_MS = 700;
  const MAX_REQUEST_RETRY_DELAY_MS = 4000;
  const MAX_REQUEST_ATTEMPTS = 3;

  const mediaDevices = navigator.mediaDevices;

  if (
    mediaDevices === undefined ||
    mediaDevices === null ||
    typeof mediaDevices.enumerateDevices !== 'function' ||
    typeof mediaDevices.getUserMedia !== 'function'
  ) {
    return;
  }

  const nativeEnumerateDevices = mediaDevices.enumerateDevices.bind(mediaDevices);
  const nativeGetUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);
  const activeRequests = new Map();
  let sharedCameraSession = null;

  function logBridgeDiagnostic(message, metadata) {
    if (metadata === undefined) {
      console.info('[Auteura Browser Camera]', message);
      return;
    }

    console.info('[Auteura Browser Camera]', message, metadata);
  }

  function createSyntheticDevice() {
    return {
      deviceId: DEVICE_ID,
      groupId: GROUP_ID,
      kind: 'videoinput',
      label: DEVICE_LABEL,
      toJSON() {
        return {
          deviceId: DEVICE_ID,
          groupId: GROUP_ID,
          kind: 'videoinput',
          label: DEVICE_LABEL,
        };
      },
    };
  }

  function getRequestedDeviceId(constraints) {
    if (typeof constraints !== 'object' || constraints === null) {
      return null;
    }

    const videoConstraints = constraints.video;
    if (typeof videoConstraints !== 'object' || videoConstraints === null) {
      return null;
    }

    const deviceId = videoConstraints.deviceId;
    if (typeof deviceId === 'string') {
      return deviceId;
    }

    if (typeof deviceId?.exact === 'string') {
      return deviceId.exact;
    }

    if (typeof deviceId?.ideal === 'string') {
      return deviceId.ideal;
    }

    return null;
  }

  function toNumberConstraint(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value?.exact === 'number' && Number.isFinite(value.exact)) {
      return value.exact;
    }

    if (typeof value?.ideal === 'number' && Number.isFinite(value.ideal)) {
      return value.ideal;
    }

    return undefined;
  }

  function parseVirtualOutputRequest(constraints) {
    const videoConstraints =
      typeof constraints?.video === 'object' && constraints.video !== null
        ? constraints.video
        : {};

    return {
      audio: constraints?.audio === true,
      ...(toNumberConstraint(videoConstraints.frameRate) === undefined
        ? {}
        : { frameRate: toNumberConstraint(videoConstraints.frameRate) }),
      ...(toNumberConstraint(videoConstraints.height) === undefined
        ? {}
        : { height: toNumberConstraint(videoConstraints.height) }),
      ...(toNumberConstraint(videoConstraints.width) === undefined
        ? {}
        : { width: toNumberConstraint(videoConstraints.width) }),
    };
  }

  function createProtocolEnvelope(type, sessionId) {
    return {
      protocol: PROTOCOL,
      protocolVersion: PROTOCOL_VERSION,
      sessionId,
      timestamp: Date.now(),
      type,
    };
  }

  function createRequestSignature(request) {
    return JSON.stringify({
      audio: request.audio === true,
      frameRate: request.frameRate ?? null,
      height: request.height ?? null,
      width: request.width ?? null,
    });
  }

  function cloneStream(stream) {
    const clonedStream = new MediaStream();
    stream.getTracks().forEach((track) => {
      clonedStream.addTrack(track.clone());
    });
    return clonedStream;
  }

  function sendBridgeMessage(message) {
    window.postMessage(
      {
        [MESSAGE_PREFIX]: true,
        ...message,
      },
      window.location.origin,
    );
  }

  function cleanupRequest(sessionId) {
    const activeRequest = activeRequests.get(sessionId);
    if (activeRequest === undefined) {
      return;
    }

    if (activeRequest.timeoutId !== null) {
      window.clearTimeout(activeRequest.timeoutId);
    }

    activeRequest.connection.onicecandidate = null;
    activeRequest.connection.ontrack = null;

    try {
      activeRequest.returnedStream?.getTracks().forEach((track) => {
        track.onended = null;
      });
      activeRequest.connection.close();
    } catch {
      // best-effort cleanup
    }

    activeRequests.delete(sessionId);
  }

  function closeSharedCameraSession() {
    if (sharedCameraSession === null) {
      return;
    }

    sharedCameraSession.sourceStream.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });

    sharedCameraSession.connection.onicecandidate = null;
    sharedCameraSession.connection.ontrack = null;

    try {
      sharedCameraSession.connection.close();
    } catch {
      // best-effort cleanup
    }

    sharedCameraSession = null;
  }

  function hasLiveSharedCameraSession(requestSignature) {
    if (sharedCameraSession === null || sharedCameraSession.requestSignature !== requestSignature) {
      return false;
    }

    return sharedCameraSession.sourceStream.getVideoTracks().some((track) => track.readyState !== 'ended');
  }

  function cloneSharedCameraStream(requestSignature) {
    if (!hasLiveSharedCameraSession(requestSignature)) {
      return null;
    }

    return cloneStream(sharedCameraSession.sourceStream);
  }

  function findPendingRequestBySignature(requestSignature) {
    for (const activeRequest of activeRequests.values()) {
      if (
        activeRequest.fulfilled === false &&
        activeRequest.requestSignature === requestSignature
      ) {
        return activeRequest;
      }
    }

    return null;
  }

  function attachResolvedStreamLifecycle(sessionId, stream) {
    stream.getTracks().forEach((track) => {
      const nativeStop = track.stop.bind(track);

      track.stop = function stop() {
        try {
          nativeStop();
        } finally {
          cleanupRequest(sessionId);
        }
      };

      track.onended = () => {
        cleanupRequest(sessionId);
      };
    });
  }

  function rejectRequest(sessionId, message) {
    const activeRequest = activeRequests.get(sessionId);
    if (activeRequest === undefined) {
      return;
    }

    logBridgeDiagnostic('Request failed.', { message, sessionId });
    activeRequest.waiters.forEach((waiter) => {
      waiter.reject(new Error(message));
    });
    cleanupRequest(sessionId);
    activeRequest.reject(new Error(message));
  }

  function scheduleRequestRetry(sessionId, reason) {
    const activeRequest = activeRequests.get(sessionId);
    if (activeRequest === undefined) {
      return;
    }

    if (activeRequest.attempts >= MAX_REQUEST_ATTEMPTS) {
      rejectRequest(sessionId, reason);
      return;
    }

    activeRequest.attempts += 1;
    const retryDelayMs = activeRequest.retryDelayMs;
    logBridgeDiagnostic('Retrying handshake.', {
      attempt: activeRequest.attempts,
      retryDelayMs,
      sessionId,
    });
    activeRequest.timeoutId = window.setTimeout(() => {
      if (activeRequests.has(sessionId) === false) {
        return;
      }

      sendBridgeMessage({
        ...createProtocolEnvelope('HANDSHAKE_INIT', sessionId),
        request: activeRequest.request,
      });
    }, retryDelayMs);
    activeRequest.retryDelayMs = Math.min(
      retryDelayMs * 2,
      MAX_REQUEST_RETRY_DELAY_MS,
    );
  }

  function resolveRequest(sessionId, stream) {
    const activeRequest = activeRequests.get(sessionId);
    if (activeRequest === undefined || activeRequest.fulfilled === true) {
      return;
    }

    if (sharedCameraSession !== null && sharedCameraSession.sessionId !== sessionId) {
      closeSharedCameraSession();
    }

    const sourceStream = stream;
    sourceStream.getTracks().forEach((track) => {
      track.onended = () => {
        if (sharedCameraSession?.sessionId === sessionId) {
          closeSharedCameraSession();
        }
      };
    });

    sharedCameraSession = {
      connection: activeRequest.connection,
      requestSignature: activeRequest.requestSignature,
      sessionId,
      sourceStream,
    };

    const resolvedStream = cloneStream(sourceStream);
    activeRequest.fulfilled = true;
    if (activeRequest.timeoutId !== null) {
      window.clearTimeout(activeRequest.timeoutId);
      activeRequest.timeoutId = null;
    }
    attachResolvedStreamLifecycle(sessionId, resolvedStream);
    const waiterStreams = activeRequest.waiters.map((waiter) => {
      const waiterStream = cloneStream(sourceStream);
      attachResolvedStreamLifecycle(sessionId, waiterStream);
      return {
        resolve: waiter.resolve,
        stream: waiterStream,
      };
    });
    activeRequests.delete(sessionId);
    logBridgeDiagnostic('Stream resolved.', {
      audioTracks: resolvedStream.getAudioTracks().length,
      sessionId,
      videoTracks: resolvedStream.getVideoTracks().length,
    });
    activeRequest.resolve(resolvedStream);
    waiterStreams.forEach((waiter) => {
      waiter.resolve(waiter.stream);
    });
  }

  function createConnectionForRequest(sessionId, request) {
    const connection = new RTCPeerConnection();
    connection.addTransceiver('video', { direction: 'recvonly' });

    if (request.audio) {
      connection.addTransceiver('audio', { direction: 'recvonly' });
    }

    connection.onicecandidate = (event) => {
      logBridgeDiagnostic('Sending ICE candidate to host.', {
        hasCandidate: event.candidate !== null,
        sessionId,
      });
      sendBridgeMessage({
        ...createProtocolEnvelope('ICE_CANDIDATE', sessionId),
        candidate: event.candidate?.toJSON?.() ?? null,
        from: 'client',
      });
    };

    connection.ontrack = (event) => {
      logBridgeDiagnostic('Received remote track.', {
        kind: event.track.kind,
        sessionId,
        streamCount: event.streams.length,
      });
      const incomingStream =
        event.streams[0] ??
        (() => {
          const fallbackStream = new MediaStream();
          fallbackStream.addTrack(event.track);
          return fallbackStream;
        })();

      resolveRequest(sessionId, incomingStream);
    };

    return connection;
  }

  function requestBrowserCameraBridge(constraints) {
    return new Promise((resolve, reject) => {
      const request = parseVirtualOutputRequest(constraints);
      const requestSignature = createRequestSignature(request);
      const sharedStream = cloneSharedCameraStream(requestSignature);

      if (sharedStream !== null) {
        logBridgeDiagnostic('Reusing shared browser-camera stream.', {
          request,
          requestSignature,
        });
        resolve(sharedStream);
        return;
      }

      const pendingRequest = findPendingRequestBySignature(requestSignature);
      if (pendingRequest !== null) {
        logBridgeDiagnostic('Joining pending browser-camera request.', {
          request,
          requestSignature,
        });
        pendingRequest.waiters.push({ reject, resolve });
        return;
      }

      const sessionId = crypto.randomUUID();
      const connection = createConnectionForRequest(sessionId, request);
      const timeoutId = window.setTimeout(() => {
        rejectRequest(sessionId, 'Timed out waiting for the Auteura browser camera host.');
      }, REQUEST_TIMEOUT_MS);

      activeRequests.set(sessionId, {
        attempts: 1,
        connection,
        fulfilled: false,
        reject,
        request,
        requestSignature,
        retryDelayMs: INITIAL_REQUEST_RETRY_DELAY_MS,
        resolve,
        timeoutId,
        waiters: [],
      });

      logBridgeDiagnostic('Sending handshake init.', { request, sessionId });
      sendBridgeMessage({
        ...createProtocolEnvelope('HANDSHAKE_INIT', sessionId),
        request,
      });
    });
  }

  function handleBridgeResponse(event) {
    if (event.source !== window || event.origin !== window.location.origin) {
      return;
    }

    if (event.data?.[RESPONSE_PREFIX] !== true) {
      return;
    }

    const message = event.data;

    if (message.protocol !== PROTOCOL || message.protocolVersion !== PROTOCOL_VERSION) {
      return;
    }

    if (message.type === 'CLIENT_REGISTER' && typeof message.clientId === 'string') {
      return;
    }

    if (typeof message.sessionId !== 'string') {
      return;
    }

    const activeRequest = activeRequests.get(message.sessionId);
    if (activeRequest === undefined) {
      if (message.type === 'HOST_OFFLINE') {
        closeSharedCameraSession();
        activeRequests.forEach((_value, requestSessionId) => {
          rejectRequest(requestSessionId, 'Auteura host is offline.');
        });
      }
      return;
    }

    switch (message.type) {
      case 'OFFER':
        logBridgeDiagnostic('Received offer from host.', { sessionId: message.sessionId });
        void activeRequest.connection
          .setRemoteDescription(message.sdp)
          .then(() => activeRequest.connection.createAnswer())
          .then((answer) => {
            return activeRequest.connection.setLocalDescription(answer).then(() => answer);
          })
          .then((answer) => {
            logBridgeDiagnostic('Sending answer to host.', { sessionId: message.sessionId });
            sendBridgeMessage({
              ...createProtocolEnvelope('ANSWER', message.sessionId),
              sdp: answer,
            });
          })
          .catch(() => {
            rejectRequest(message.sessionId, 'Failed to establish the Auteura browser camera stream.');
          });
        return;
      case 'ICE_CANDIDATE':
        if (message.from !== 'host') {
          return;
        }

        logBridgeDiagnostic('Received ICE candidate from host.', {
          hasCandidate: message.candidate !== null,
          sessionId: message.sessionId,
        });
        void activeRequest.connection.addIceCandidate(message.candidate).catch(() => {
          rejectRequest(message.sessionId, 'Failed to apply Auteura browser camera ICE candidate.');
        });
        return;
      case 'ERROR':
        if (message.code === 'BRIDGE_UNAVAILABLE') {
          scheduleRequestRetry(
            message.sessionId,
            typeof message.message === 'string'
              ? message.message
              : 'Auteura host unavailable.',
          );
          return;
        }

        rejectRequest(message.sessionId, typeof message.message === 'string' ? message.message : 'Auteura host unavailable.');
        return;
      case 'HOST_OFFLINE':
        closeSharedCameraSession();
        scheduleRequestRetry(message.sessionId, 'Auteura host is offline.');
        return;
      default:
        return;
    }
  }

  window.addEventListener('message', handleBridgeResponse);
  window.addEventListener('beforeunload', () => {
    activeRequests.forEach((_value, sessionId) => {
      cleanupRequest(sessionId);
    });
    closeSharedCameraSession();
  });

  Object.defineProperty(mediaDevices, 'enumerateDevices', {
    configurable: true,
    value: function enumerateDevices() {
      return nativeEnumerateDevices().then((devices) => {
        return [createSyntheticDevice(), ...devices];
      });
    },
    writable: true,
  });

  Object.defineProperty(mediaDevices, 'getUserMedia', {
    configurable: true,
    value: function getUserMedia(constraints) {
      if (getRequestedDeviceId(constraints) === DEVICE_ID) {
        return requestBrowserCameraBridge(constraints);
      }

      return nativeGetUserMedia(constraints);
    },
    writable: true,
  });
})();
