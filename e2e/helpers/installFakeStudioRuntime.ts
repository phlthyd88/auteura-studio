import type { Page } from '@playwright/test';

export async function installFakeStudioRuntime(page: Page): Promise<void> {
  await page.addInitScript((): void => {
    const globalScope = globalThis as typeof globalThis & {
      __auteuraCameraCanvas?: HTMLCanvasElement;
      __auteuraNativeMediaRecorder?: typeof MediaRecorder;
      __auteuraRecorderIntervalId?: number;
      __auteuraVisibilityHidden?: boolean;
      __auteuraSetVisibilityHidden?: (hidden: boolean) => void;
    };

    globalScope.__auteuraNativeMediaRecorder = globalThis.MediaRecorder;

    class FakeMediaRecorder extends EventTarget implements MediaRecorder {
      static isTypeSupported(): boolean {
        return true;
      }

      mimeType: string;

      state: RecordingState = 'inactive';

      stream: MediaStream;

      videoBitsPerSecond: number;

      audioBitsPerSecond = 0;

      audioBitrateMode: AudioBitrateMode = 'constant';

      ignoreMutedMedia = false;

      ondataavailable: ((this: MediaRecorder, event: BlobEvent) => void) | null = null;

      onerror: ((this: MediaRecorder, event: Event) => void) | null = null;

      onpause: ((this: MediaRecorder, event: Event) => void) | null = null;

      onresume: ((this: MediaRecorder, event: Event) => void) | null = null;

      onstart: ((this: MediaRecorder, event: Event) => void) | null = null;

      onstop: ((this: MediaRecorder, event: Event) => void) | null = null;

      constructor(stream: MediaStream, options?: MediaRecorderOptions) {
        super();
        this.stream = stream;
        this.mimeType = options?.mimeType ?? 'video/webm';
        this.videoBitsPerSecond = options?.videoBitsPerSecond ?? 4_000_000;
      }

      pause(): void {
        this.state = 'paused';
      }

      requestData(): void {
        const blob = new Blob(['test-recording-data'], {
          type: this.mimeType,
        });
        const event = new BlobEvent('dataavailable', {
          data: blob,
        });
        this.ondataavailable?.call(this, event);
      }

      resume(): void {
        this.state = 'recording';
      }

      start(): void {
        this.state = 'recording';
        this.onstart?.call(this, new Event('start'));

        globalScope.__auteuraRecorderIntervalId = window.setInterval((): void => {
          this.requestData();
        }, 150);
      }

      stop(): void {
        if (this.state === 'inactive') {
          return;
        }

        if (globalScope.__auteuraRecorderIntervalId !== undefined) {
          window.clearInterval(globalScope.__auteuraRecorderIntervalId);
          globalScope.__auteuraRecorderIntervalId = undefined;
        }

        this.requestData();
        this.state = 'inactive';
        this.onstop?.call(this, new Event('stop'));
      }
    }

    function buildFakeCameraStream(): MediaStream {
      if (globalScope.__auteuraCameraCanvas === undefined) {
        const sourceCanvas = document.createElement('canvas');
        sourceCanvas.width = 640;
        sourceCanvas.height = 360;
        const sourceContext = sourceCanvas.getContext('2d');

        if (sourceContext === null) {
          throw new Error('Failed to create fake camera context.');
        }

        let frameIndex = 0;
        window.setInterval((): void => {
          frameIndex += 1;
          sourceContext.fillStyle = '#020617';
          sourceContext.fillRect(0, 0, sourceCanvas.width, sourceCanvas.height);
          sourceContext.fillStyle = '#f59e0b';
          sourceContext.fillRect((frameIndex * 9) % sourceCanvas.width, 48, 120, 120);
          sourceContext.fillStyle = '#38bdf8';
          sourceContext.font = '28px sans-serif';
          sourceContext.fillText(`Auteura ${frameIndex}`, 32, 56);
        }, 60);

        globalScope.__auteuraCameraCanvas = sourceCanvas;
      }

      const liveCanvas = globalScope.__auteuraCameraCanvas;

      if (liveCanvas === undefined) {
        throw new Error('Fake camera canvas was not initialized.');
      }

      const stream = liveCanvas.captureStream(30);
      const videoTracks = stream.getVideoTracks().map((track: MediaStreamTrack): MediaStreamTrack =>
        track.clone(),
      );

      return new MediaStream(videoTracks);
    }

    Object.defineProperty(window, 'MediaRecorder', {
      configurable: true,
      writable: true,
      value: FakeMediaRecorder,
    });

    globalScope.__auteuraVisibilityHidden = false;

    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get(): boolean {
        return globalScope.__auteuraVisibilityHidden ?? false;
      },
    });

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get(): DocumentVisibilityState {
        return (globalScope.__auteuraVisibilityHidden ?? false) ? 'hidden' : 'visible';
      },
    });

    globalScope.__auteuraSetVisibilityHidden = (hidden: boolean): void => {
      globalScope.__auteuraVisibilityHidden = hidden;
      const event = new Event('visibilitychange');
      document.dispatchEvent(event);
      window.dispatchEvent(event);
    };

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        addEventListener(): void {
          return undefined;
        },
        async enumerateDevices(): Promise<readonly MediaDeviceInfo[]> {
          return [
            {
              deviceId: 'studio-cam',
              groupId: 'studio',
              kind: 'videoinput',
              label: 'Studio Camera',
              toJSON(): string {
                return 'Studio Camera';
              },
            },
          ] as readonly MediaDeviceInfo[];
        },
        async getUserMedia(): Promise<MediaStream> {
          return buildFakeCameraStream();
        },
        removeEventListener(): void {
          return undefined;
        },
      },
    });
  });
}
