import { expect, test, type Page } from '@playwright/test';

async function seedExportSourceVideo(page: Page): Promise<void> {
  await page.evaluate(async (): Promise<void> => {
    const globalScope = globalThis as typeof globalThis & {
      __auteuraNativeMediaRecorder?: typeof MediaRecorder;
    };
    const NativeMediaRecorder = globalScope.__auteuraNativeMediaRecorder;

    if (typeof NativeMediaRecorder !== 'function') {
      throw new Error('Native MediaRecorder is unavailable for export verification.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext('2d');

    if (context === null) {
      throw new Error('Failed to create export source canvas.');
    }

    let frameIndex = 0;
    const drawFrame = (): void => {
      frameIndex += 1;
      context.fillStyle = '#08111f';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#f59e0b';
      context.fillRect((frameIndex * 7) % canvas.width, 40, 96, 96);
      context.fillStyle = '#38bdf8';
      context.font = '24px sans-serif';
      context.fillText(`Export ${frameIndex}`, 24, 40);
      context.fillStyle = '#e2e8f0';
      context.fillText('Playwright runtime source', 24, 156);
    };

    drawFrame();
    const drawIntervalId = window.setInterval(drawFrame, 50);

    const audioContext = new window.AudioContext();
    await audioContext.resume().catch((): void => undefined);
    const oscillatorNode = audioContext.createOscillator();
    oscillatorNode.type = 'sine';
    oscillatorNode.frequency.value = 220;
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 0.04;
    const destinationNode = audioContext.createMediaStreamDestination();
    oscillatorNode.connect(gainNode);
    gainNode.connect(destinationNode);
    oscillatorNode.start();

    const captureStream = canvas.captureStream(20);
    const combinedStream = new MediaStream([
      ...captureStream.getVideoTracks(),
      ...destinationNode.stream.getAudioTracks(),
    ]);

    const mimeTypeCandidates = [
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9,opus',
      'video/webm',
    ];
    const mimeType =
      mimeTypeCandidates.find((candidate: string): boolean => {
        if (typeof NativeMediaRecorder.isTypeSupported !== 'function') {
          return candidate === 'video/webm';
        }

        return NativeMediaRecorder.isTypeSupported(candidate);
      }) ?? 'video/webm';
    const recorder = new NativeMediaRecorder(combinedStream, { mimeType });
    const recordedChunks: Blob[] = [];

    const recordedBlob = await new Promise<Blob>((resolve, reject): void => {
      recorder.onerror = (): void => {
        reject(new Error('Native MediaRecorder failed while generating export source.'));
      };
      recorder.ondataavailable = (event: BlobEvent): void => {
        if (event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      };
      recorder.onstop = (): void => {
        resolve(
          new Blob(recordedChunks, {
            type: mimeType,
          }),
        );
      };

      recorder.start(250);
      window.setTimeout((): void => {
        recorder.stop();
      }, 10_400);
    });

    window.clearInterval(drawIntervalId);
    captureStream.getTracks().forEach((track: MediaStreamTrack): void => {
      track.stop();
    });
    combinedStream.getTracks().forEach((track: MediaStreamTrack): void => {
      track.stop();
    });
    oscillatorNode.stop();
    await audioContext.close();

    const { saveMedia } = await import('/src/services/MediaStorageService.ts');
    const timestamp = Date.now();
    await saveMedia({
      blob: recordedBlob,
      captureMode: 'recording',
      createdAt: timestamp,
      durationMs: 10_400,
      height: canvas.height,
      id: crypto.randomUUID(),
      isAvailable: true,
      mimeType: recordedBlob.type || mimeType,
      name: 'playwright-export-source.webm',
      origin: 'capture',
      sizeBytes: recordedBlob.size,
      storageKind: 'copied-indexeddb',
      thumbnail: canvas.toDataURL('image/webp', 0.72),
      timestamp,
      type: 'video',
      width: canvas.width,
    });
  });
}

test.beforeEach(async ({ page }): Promise<void> => {
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
      document.dispatchEvent(new Event('visibilitychange'));
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
});

test('launches, records, persists after reload, and exposes download/delete actions', async ({
  page,
}): Promise<void> => {
  await page.goto('/');

  await expect(page.getByText('Viewfinder Output')).toBeVisible();

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Start Recording' }).click();
  await page.waitForTimeout(650);
  await page.getByRole('button', { name: 'Stop Recording' }).click();

  await page.getByRole('button', { name: 'Media' }).click();
  const firstMediaItem = page.locator('li').first();
  await expect(firstMediaItem).toContainText('recording');

  await page.reload();
  await page.getByRole('button', { name: 'Media' }).click();
  await expect(page.locator('li').first()).toContainText('recording');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download recording/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('recording');

  await page.getByRole('button', { name: /Delete recording/i }).click();
  await expect(page.locator('li')).toHaveCount(0);
});

test('imports a LUT, saves a look preset, and restores both after reload', async ({
  page,
}): Promise<void> => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Adjust' }).click();

  await page.locator('input[type="file"]').setInputFiles({
    mimeType: 'application/octet-stream',
    name: 'Playwright Teal.cube',
    buffer: Buffer.from(
      [
        'TITLE "Playwright Teal"',
        'LUT_3D_SIZE 2',
        'DOMAIN_MIN 0 0 0',
        'DOMAIN_MAX 1 1 1',
        '0 0 0',
        '1 0 0',
        '0 1 0',
        '1 1 0',
        '0 0 1',
        '1 0 1',
        '0 1 1',
        '1 1 1',
      ].join('\n'),
      'utf8',
    ),
  });

  await expect(page.getByText('Playwright Teal.cube', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Load imported LUT Playwright Teal' }).click();

  const presetNameField = page.getByLabel('Preset name');
  await presetNameField.fill('Playwright Look');
  await page.getByRole('button', { name: 'Save look preset' }).click();

  await expect(page.getByText('Playwright Look')).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Adjust' }).click();

  await expect(page.getByText('Playwright Teal.cube', { exact: true })).toBeVisible();
  await expect(page.getByText('Playwright Look', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Load look preset Playwright Look' }).click();
  await expect(page.getByText('Playwright Teal.cube', { exact: true })).toBeVisible();
});

test('enables portrait retouch and applies a scene insight recommendation', async ({
  page,
}): Promise<void> => {
  await page.goto('/');

  await page.getByRole('button', { name: 'AI' }).click();
  const portraitToggle = page.getByRole('checkbox', { name: /Portrait retouch/i });
  await portraitToggle.check();
  await expect(portraitToggle).toBeChecked();

  await page.getByRole('button', { name: 'View' }).click();
  const applyInsightButton = page.locator('button[aria-label^="Apply scene insight"]').first();
  await expect(applyInsightButton).toBeVisible({ timeout: 10000 });
  const insightLabel = await applyInsightButton.getAttribute('aria-label');

  expect(insightLabel).not.toBeNull();

  if (insightLabel === null) {
    throw new Error('Expected a scene insight apply button label.');
  }

  await applyInsightButton.click();
  await expect(page.locator(`button[aria-label="${insightLabel}"]`)).toHaveCount(0);
});

test('shows browser camera setup guidance and fallback workflow', async ({
  page,
}): Promise<void> => {
  await page.goto('/');

  await page.getByRole('button', { name: 'View' }).click();

  await expect(page.getByRole('heading', { name: 'Setup' })).toBeVisible();
  await expect(page.getByText('Extension not detected')).toBeVisible();
  await expect(
    page.getByText('Window share / PiP when the extension path is unavailable'),
  ).toBeVisible();
  await expect(
    page.getByText('Open Google Meet and choose “Auteura Browser Camera” as the video source.'),
  ).toBeVisible();

  const pipButton = page.getByRole('button', { name: 'Enable PiP overlay' });
  await expect(pipButton).toBeVisible();
  await pipButton.click();
  await expect(page.getByRole('button', { name: 'PiP ready' })).toBeVisible();
});

test('pauses timelapse while hidden and does not burst missed captures on resume', async ({
  page,
}): Promise<void> => {
  const getTimelapseShotCount = async (): Promise<number> => {
    const label =
      (await page
        .getByRole('button', { name: /Stop Timelapse \(\d+\)/ })
        .textContent()) ?? '';
    const match = label.match(/\((\d+)\)/);

    if (match === null) {
      throw new Error(`Unexpected timelapse control label: ${label}`);
    }

    return Number(match[1]);
  };

  await page.goto('/');
  await page.getByRole('button', { name: 'Media' }).click();
  await page.getByRole('button', { name: 'Reset DB' }).click();

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Timelapse Interval').click();
  await page.getByRole('option', { name: '1 second' }).click();
  await page.getByRole('button', { name: 'Start Timelapse' }).click();
  await expect(page.getByRole('button', { name: 'Stop Timelapse (1)' })).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.getByRole('button', { name: 'Stop Timelapse (2)' })).toBeVisible({
    timeout: 5_000,
  });
  const shotsBeforeHide = await getTimelapseShotCount();
  await page.evaluate((): void => {
    (globalThis as typeof globalThis & {
      __auteuraSetVisibilityHidden?: (hidden: boolean) => void;
    }).__auteuraSetVisibilityHidden?.(true);
  });
  await page.waitForTimeout(2500);
  await expect(page.getByText('Paused while tab is hidden')).toBeVisible();
  const shotsWhileHidden = await getTimelapseShotCount();
  expect(shotsWhileHidden).toBeGreaterThanOrEqual(shotsBeforeHide);
  expect(shotsWhileHidden).toBeLessThanOrEqual(shotsBeforeHide + 1);
  await page.evaluate((): void => {
    (globalThis as typeof globalThis & {
      __auteuraSetVisibilityHidden?: (hidden: boolean) => void;
    }).__auteuraSetVisibilityHidden?.(false);
  });
  await expect.poll(getTimelapseShotCount).toBe(shotsWhileHidden + 1, {
    timeout: 5_000,
  });
  await page.getByRole('button', { name: /Stop Timelapse/i }).click();

  await page.getByRole('button', { name: 'Media' }).click();
  const timelapseItems = page.getByText(/timelapse-/i);
  const timelapseItemCount = await timelapseItems.count();

  expect(timelapseItemCount).toBeGreaterThanOrEqual(shotsWhileHidden + 1);
  expect(timelapseItemCount).toBeLessThanOrEqual(shotsWhileHidden + 2);
});

test('exports a manifest project package after adding media to the timeline', async ({
  page,
}): Promise<void> => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Capture Photo' }).click();

  await page.getByRole('button', { name: 'Timeline' }).click();
  await page.getByRole('button', { name: 'Add' }).first().click();

  await page.evaluate((): void => {
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: undefined,
      writable: true,
    });
  });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Package' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toContain('.auteura-project.json');
});

test('exports a WebM timeline with a multi-segment playable source', async ({
  page,
}): Promise<void> => {
  test.setTimeout(150_000);

  await page.goto('/');
  await seedExportSourceVideo(page);
  await page.reload();

  await page.getByRole('button', { name: 'Timeline' }).click();
  await expect(page.getByText('playwright-export-source.webm', { exact: true })).toBeVisible();
  const sourceMediaCard = page
    .getByText('playwright-export-source.webm', { exact: true })
    .locator('xpath=ancestor::*[.//button[normalize-space()="Add"]][1]');
  await sourceMediaCard.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(
    page.getByRole('button', { name: /playwright-export-source\.webm 00:00:10/i }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Export WebM' }).click();
  await expect(page.getByText(/Export State:\s*completed/i)).toBeVisible({
    timeout: 120_000,
  });

  await page.getByRole('button', { name: 'Media' }).click();
  await expect(page.getByText(/timeline-export-\d+\.webm/i)).toBeVisible({
    timeout: 15_000,
  });
});
