import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

interface ChromeListener<TArgs extends unknown[]> {
  addListener(listener: (...args: TArgs) => void): void;
  emit(...args: TArgs): void;
}

function createChromeListener<TArgs extends unknown[]>(): ChromeListener<TArgs> {
  const listeners = new Set<(...args: TArgs) => void>();

  return {
    addListener(listener: (...args: TArgs) => void): void {
      listeners.add(listener);
    },
    emit(...args: TArgs): void {
      listeners.forEach((listener): void => {
        listener(...args);
      });
    },
  };
}

class MockPort {
  readonly name: string;
  readonly sender:
    | {
        readonly documentUrl?: string;
        readonly url?: string;
      }
    | undefined;
  readonly postedMessages: unknown[] = [];
  readonly onDisconnect = createChromeListener<[]>();
  readonly onMessage = createChromeListener<[unknown]>();
  disconnected = false;

  constructor(
    name: string,
    sender?: {
      readonly documentUrl?: string;
      readonly url?: string;
    },
  ) {
    this.name = name;
    this.sender = sender;
  }

  disconnect(): void {
    this.disconnected = true;
    this.onDisconnect.emit();
  }

  postMessage(message: unknown): void {
    this.postedMessages.push(message);
  }
}

interface ChromeMock {
  readonly runtime: {
    readonly onConnect: ChromeListener<[MockPort]>;
    readonly onInstalled: ChromeListener<[]>;
    readonly onMessage: ChromeListener<
      [unknown, { readonly url?: string } | undefined, (response: unknown) => void]
    >;
    readonly onStartup: ChromeListener<[]>;
  };
  readonly scripting: {
    readonly getRegisteredContentScripts: MockAsyncMethod<readonly { readonly id: string }[]>;
    readonly registerContentScripts: MockAsyncMethod<void>;
    readonly unregisterContentScripts: MockAsyncMethod<void>;
  };
  readonly storage: {
    readonly local: {
      readonly get: MockAsyncMethod<Record<string, unknown>>;
      readonly set: MockAsyncMethod<Record<string, unknown>>;
    };
  };
}

interface MockAsyncMethod<TResult> {
  (...args: readonly unknown[]): Promise<TResult>;
  readonly calls: unknown[][];
}

function createAsyncMethod<TResult>(
  implementation: (...args: readonly unknown[]) => TResult | Promise<TResult>,
): MockAsyncMethod<TResult> {
  const calls: unknown[][] = [];

  const method = (async (...args: readonly unknown[]): Promise<TResult> => {
    calls.push([...args]);
    return implementation(...args);
  }) as MockAsyncMethod<TResult>;

  Object.defineProperty(method, 'calls', {
    value: calls,
  });

  return method;
}

function createChromeMock(
  existingScripts: readonly { readonly id: string }[] = [],
  options: {
    readonly meetIntegrationMode?: string;
  } = {},
): ChromeMock {
  return {
    runtime: {
      onConnect: createChromeListener<[MockPort]>(),
      onInstalled: createChromeListener<[]>(),
      onMessage: createChromeListener<
        [unknown, { readonly url?: string } | undefined, (response: unknown) => void]
      >(),
      onStartup: createChromeListener<[]>(),
    },
    scripting: {
      getRegisteredContentScripts: createAsyncMethod(() => existingScripts),
      registerContentScripts: createAsyncMethod(() => undefined),
      unregisterContentScripts: createAsyncMethod(() => undefined),
    },
    storage: {
      local: {
        get: createAsyncMethod(() => ({
          meetIntegrationMode: options.meetIntegrationMode,
        })),
        set: createAsyncMethod((...args: readonly unknown[]) => {
          return (args[0] ?? {}) as Record<string, unknown>;
        }),
      },
    },
  };
}

function loadBackgroundScript(
  chromeMock: ChromeMock,
): {
  readonly __AUTEURA_BROWSER_CAMERA_TEST_API__?: {
    readonly registerContentScripts?: () => Promise<void>;
  };
} {
  const backgroundScriptPath = path.resolve(
    '/home/jlf88/auteura/extensions/auteura-browser-camera/background.js',
  );
  const source = readFileSync(backgroundScriptPath, 'utf8');

  const context: {
    Date: DateConstructor;
    Map: MapConstructor;
    Set: SetConstructor;
    chrome: ChromeMock;
    console: Console;
    crypto: Crypto;
    __AUTEURA_BROWSER_CAMERA_TEST_API__?: {
      readonly registerContentScripts?: () => Promise<void>;
    };
  } = {
    Date,
    Map,
    Set,
    chrome: chromeMock,
    console,
    crypto,
  };

  vm.runInNewContext(source, context);
  return context;
}

function findPostedMessage<TMessage>(
  port: MockPort,
  type: string,
): TMessage | undefined {
  return port.postedMessages.find(
    (message: unknown): boolean =>
      typeof message === 'object' &&
      message !== null &&
      'type' in message &&
      (message as { readonly type?: string }).type === type,
  ) as TMessage | undefined;
}

describe('browser camera extension background broker', (): void => {
  it('registers the expected content scripts on install', async (): Promise<void> => {
    const chromeMock = createChromeMock();
    const context = loadBackgroundScript(chromeMock);

    await context.__AUTEURA_BROWSER_CAMERA_TEST_API__?.registerContentScripts?.();

    expect(chromeMock.scripting.unregisterContentScripts.calls).toHaveLength(0);
    expect(chromeMock.scripting.registerContentScripts.calls.length).toBeGreaterThan(0);

    const registeredScriptsCall = chromeMock.scripting.registerContentScripts.calls.at(-1) as
      | [unknown]
      | undefined;
    const registeredScripts = registeredScriptsCall?.[0];
    expect(registeredScripts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          allFrames: false,
          id: 'auteura-browser-camera-host-bridge',
          js: ['host-bridge.content.js'],
          world: 'ISOLATED',
        }),
        expect.objectContaining({
          allFrames: false,
          id: 'auteura-browser-camera-page-bridge',
          js: ['page-bridge.content.js'],
          world: 'ISOLATED',
        }),
        expect.objectContaining({
          allFrames: false,
          id: 'auteura-browser-camera-page-shim',
          js: ['page-shim.main.js'],
          world: 'MAIN',
        }),
      ]),
    );
  });

  it('registers only the isolated Meet bridge in bridge-only mode', async (): Promise<void> => {
    const chromeMock = createChromeMock([], {
      meetIntegrationMode: 'bridge-only',
    });
    const context = loadBackgroundScript(chromeMock);

    await context.__AUTEURA_BROWSER_CAMERA_TEST_API__?.registerContentScripts?.();

    const registeredScriptsCall = chromeMock.scripting.registerContentScripts.calls.at(-1) as
      | [unknown]
      | undefined;
    const registeredScripts = registeredScriptsCall?.[0] as
      | readonly Record<string, unknown>[]
      | undefined;

    expect(registeredScripts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'auteura-browser-camera-page-bridge',
        }),
      ]),
    );
    expect(registeredScripts).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'auteura-browser-camera-page-shim',
        }),
      ]),
    );
  });

  it('routes host and client bridge messages and broadcasts host offline state', (): void => {
    const chromeMock = createChromeMock();

    loadBackgroundScript(chromeMock);

    const hostPort = new MockPort('auteura-browser-camera-host', {
      url: 'http://localhost:5173/',
    });
    const clientPort = new MockPort('auteura-browser-camera-client', {
      url: 'https://meet.google.com/abc-defg-hij',
    });

    chromeMock.runtime.onConnect.emit(hostPort);
    chromeMock.runtime.onConnect.emit(clientPort);

    hostPort.onMessage.emit({
      hostId: 'host-1',
      protocol: 'auteura-virtual-output',
      protocolVersion: 1,
      sessionId: 'register-session',
      timestamp: Date.now(),
      type: 'HOST_REGISTER',
    });

    expect(hostPort.postedMessages).toContainEqual(
      expect.objectContaining({
        hostId: 'host-1',
        type: 'HOST_REGISTER_ACK',
      }),
    );

    clientPort.onMessage.emit({
      pageOrigin: 'https://meet.google.com',
      protocol: 'auteura-virtual-output',
      protocolVersion: 1,
      sessionId: 'bridge',
      timestamp: Date.now(),
      type: 'CLIENT_REGISTER',
    });

    const clientRegistrationMessage = findPostedMessage<{ readonly clientId: string }>(
      clientPort,
      'CLIENT_REGISTER',
    );

    expect(clientRegistrationMessage?.clientId).toBeTruthy();

    clientPort.onMessage.emit({
      protocol: 'auteura-virtual-output',
      protocolVersion: 1,
      request: { audio: false },
      sessionId: 'client-session',
      timestamp: Date.now(),
      type: 'HANDSHAKE_INIT',
    });

    expect(hostPort.postedMessages).toContainEqual(
      expect.objectContaining({
        clientId: clientRegistrationMessage?.clientId,
        request: { audio: false },
        type: 'HANDSHAKE_INIT',
      }),
    );

    hostPort.disconnect();

    expect(clientPort.postedMessages).toContainEqual(
      expect.objectContaining({
        reason: 'Host bridge disconnected.',
        type: 'HOST_OFFLINE',
      }),
    );
  });

  it('disconnects ports from unsupported origins', (): void => {
    const chromeMock = createChromeMock();

    loadBackgroundScript(chromeMock);

    const unsupportedHostPort = new MockPort('auteura-browser-camera-host', {
      url: 'https://example.com/app',
    });
    const unsupportedClientPort = new MockPort('auteura-browser-camera-client', {
      url: 'https://zoom.us/wc/join',
    });

    chromeMock.runtime.onConnect.emit(unsupportedHostPort);
    chromeMock.runtime.onConnect.emit(unsupportedClientPort);

    expect(unsupportedHostPort.disconnected).toBe(true);
    expect(unsupportedClientPort.disconnected).toBe(true);
    expect(unsupportedHostPort.postedMessages).toHaveLength(0);
    expect(unsupportedClientPort.postedMessages).toHaveLength(0);
  });

  it('rejects client registration when the declared page origin does not match the sender', (): void => {
    const chromeMock = createChromeMock();

    loadBackgroundScript(chromeMock);

    const clientPort = new MockPort('auteura-browser-camera-client', {
      url: 'https://meet.google.com/abc-defg-hij',
    });

    chromeMock.runtime.onConnect.emit(clientPort);
    clientPort.onMessage.emit({
      pageOrigin: 'https://evil.example.com',
      protocol: 'auteura-virtual-output',
      protocolVersion: 1,
      sessionId: 'bridge',
      timestamp: Date.now(),
      type: 'CLIENT_REGISTER',
    });

    expect(clientPort.postedMessages).toContainEqual(
      expect.objectContaining({
        code: 'INVALID_MESSAGE',
        message: 'Auteura browser-camera registration was rejected.',
        type: 'ERROR',
      }),
    );
    expect(findPostedMessage(clientPort, 'CLIENT_REGISTER')).toBeUndefined();
  });

  it('reports bridge unavailable when a client starts a handshake before the host is connected', (): void => {
    const chromeMock = createChromeMock();

    loadBackgroundScript(chromeMock);

    const clientPort = new MockPort('auteura-browser-camera-client', {
      url: 'https://meet.google.com/abc-defg-hij',
    });

    chromeMock.runtime.onConnect.emit(clientPort);
    clientPort.onMessage.emit({
      pageOrigin: 'https://meet.google.com',
      protocol: 'auteura-virtual-output',
      protocolVersion: 1,
      sessionId: 'bridge',
      timestamp: Date.now(),
      type: 'CLIENT_REGISTER',
    });
    clientPort.onMessage.emit({
      protocol: 'auteura-virtual-output',
      protocolVersion: 1,
      request: { audio: false },
      sessionId: 'client-session',
      timestamp: Date.now(),
      type: 'HANDSHAKE_INIT',
    });

    expect(clientPort.postedMessages).toContainEqual(
      expect.objectContaining({
        code: 'BRIDGE_UNAVAILABLE',
        message: 'Auteura host is offline.',
        sessionId: 'client-session',
        type: 'ERROR',
      }),
    );
  });
});
