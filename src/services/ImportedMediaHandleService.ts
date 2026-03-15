import type {
  AuteuraFileSystemFileHandle,
  ImportedMediaCapability,
  ImportedMediaStorageKind,
  ImportedMediaType,
  PreparedImportedMedia,
} from '../types/importedMedia';

type OpenFilePickerWindow = Window & {
  showOpenFilePicker?: (options?: {
    readonly excludeAcceptAllOption?: boolean;
    readonly multiple?: boolean;
    readonly types?: readonly {
      readonly accept: Record<string, readonly string[]>;
      readonly description: string;
    }[];
  }) => Promise<readonly AuteuraFileSystemFileHandle[]>;
};

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) {
    throw new DOMException('The media import was cancelled.', 'AbortError');
  }
}

function getImportedMediaType(mimeType: string): ImportedMediaType | null {
  if (mimeType.startsWith('image/')) {
    return 'image';
  }

  if (mimeType.startsWith('video/')) {
    return 'video';
  }

  return null;
}

function createThumbnailCanvas(width: number, height: number): HTMLCanvasElement {
  const maxWidth = 240;
  const maxHeight = 160;
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  return canvas;
}

async function loadImageMetadata(
  file: File,
  signal?: AbortSignal,
): Promise<Pick<PreparedImportedMedia, 'height' | 'thumbnail' | 'width'>> {
  const objectUrl = URL.createObjectURL(file);

  try {
    return await new Promise((resolve, reject): void => {
      const imageElement = new Image();
      const abortListener = (): void => {
        reject(new DOMException('The media import was cancelled.', 'AbortError'));
      };

      imageElement.onload = (): void => {
        try {
          assertNotAborted(signal);
          const canvas = createThumbnailCanvas(
            imageElement.naturalWidth,
            imageElement.naturalHeight,
          );
          const context = canvas.getContext('2d');

          if (context !== null) {
            context.drawImage(imageElement, 0, 0, canvas.width, canvas.height);
          }

          resolve({
            height: imageElement.naturalHeight,
            ...(context === null
              ? {}
              : { thumbnail: canvas.toDataURL('image/webp', 0.82) }),
            width: imageElement.naturalWidth,
          });
        } catch (error: unknown) {
          reject(error instanceof Error ? error : new Error('Failed to inspect the selected image.'));
        }
      };

      imageElement.onerror = (): void => {
        reject(new Error('Failed to load the selected image.'));
      };

      if (signal !== undefined) {
        signal.addEventListener('abort', abortListener, { once: true });
      }

      imageElement.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function loadVideoMetadata(
  file: File,
  signal?: AbortSignal,
): Promise<Pick<PreparedImportedMedia, 'durationMs' | 'height' | 'thumbnail' | 'width'>> {
  const objectUrl = URL.createObjectURL(file);

  try {
    return await new Promise((resolve, reject): void => {
      const videoElement = document.createElement('video');
      let settled = false;

      const finish = (
        nextValue:
          | Pick<PreparedImportedMedia, 'durationMs' | 'height' | 'thumbnail' | 'width'>
          | Error,
      ): void => {
        if (settled) {
          return;
        }

        settled = true;
        videoElement.pause();
        videoElement.removeAttribute('src');
        videoElement.load();

        if (nextValue instanceof Error) {
          reject(nextValue);
          return;
        }

        resolve(nextValue);
      };

      const abortListener = (): void => {
        finish(new DOMException('The media import was cancelled.', 'AbortError'));
      };

      videoElement.preload = 'metadata';
      videoElement.muted = true;
      videoElement.playsInline = true;

      videoElement.onloadedmetadata = (): void => {
        try {
          assertNotAborted(signal);
          videoElement.currentTime = 0;
        } catch (error: unknown) {
          finish(error instanceof Error ? error : new Error('Failed to inspect the selected video.'));
        }
      };

      videoElement.onloadeddata = (): void => {
        try {
          assertNotAborted(signal);
          const canvas = createThumbnailCanvas(videoElement.videoWidth, videoElement.videoHeight);
          const context = canvas.getContext('2d');

          if (context !== null) {
            context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
          }

          finish({
            ...(Number.isFinite(videoElement.duration)
              ? { durationMs: Math.max(0, Math.round(videoElement.duration * 1000)) }
              : {}),
            height: videoElement.videoHeight,
            ...(context === null
              ? {}
              : { thumbnail: canvas.toDataURL('image/webp', 0.78) }),
            width: videoElement.videoWidth,
          });
        } catch (error: unknown) {
          finish(error instanceof Error ? error : new Error('Failed to inspect the selected video.'));
        }
      };

      videoElement.onerror = (): void => {
        finish(new Error('Failed to load the selected video.'));
      };

      if (signal !== undefined) {
        signal.addEventListener('abort', abortListener, { once: true });
      }

      videoElement.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function prepareImportedFile(
  file: File,
  importStrategy: ImportedMediaStorageKind,
  fileHandle: AuteuraFileSystemFileHandle | null,
  signal?: AbortSignal,
): Promise<PreparedImportedMedia> {
  assertNotAborted(signal);

  const mediaType = getImportedMediaType(file.type);

  if (mediaType === null) {
    throw new Error(`Unsupported media type: ${file.type || file.name}`);
  }

  const metadata =
    mediaType === 'image'
      ? await loadImageMetadata(file, signal)
      : await loadVideoMetadata(file, signal);

  return {
    file,
    fileHandle,
    importStrategy,
    mimeType: file.type,
    name: file.name,
    sizeBytes: file.size,
    timestamp: Date.now(),
    type: mediaType,
    ...(metadata.height === undefined ? {} : { height: metadata.height }),
    ...(metadata.thumbnail === undefined ? {} : { thumbnail: metadata.thumbnail }),
    ...(metadata.width === undefined ? {} : { width: metadata.width }),
    ...('durationMs' in metadata && typeof metadata.durationMs === 'number'
      ? { durationMs: metadata.durationMs }
      : {}),
  };
}

export function getImportedMediaCapability(): ImportedMediaCapability {
  if (typeof window === 'undefined') {
    return {
      fileSystemAccessSupported: false,
      preferredStrategy: 'unsupported',
    };
  }

  const pickerWindow = window as OpenFilePickerWindow;
  const fileSystemAccessSupported = typeof pickerWindow.showOpenFilePicker === 'function';

  return {
    fileSystemAccessSupported,
    preferredStrategy: fileSystemAccessSupported ? 'file-system-handle' : 'copied-indexeddb',
  };
}

export async function pickImportedMediaHandles(
  signal?: AbortSignal,
): Promise<readonly PreparedImportedMedia[]> {
  const pickerWindow = window as OpenFilePickerWindow;

  if (typeof pickerWindow.showOpenFilePicker !== 'function') {
    throw new Error('Persistent file-handle import is not available in this browser.');
  }

  const handles = await pickerWindow.showOpenFilePicker({
    excludeAcceptAllOption: false,
    multiple: true,
    types: [
      {
        accept: {
          'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
          'video/*': ['.mp4', '.mov', '.webm', '.mkv'],
        },
        description: 'Image and video media',
      },
    ],
  });
  const preparedMedia: PreparedImportedMedia[] = [];

  for (const handle of handles) {
    assertNotAborted(signal);
    const file = await handle.getFile();
    preparedMedia.push(
      await prepareImportedFile(file, 'file-system-handle', handle, signal),
    );
  }

  return preparedMedia;
}

export async function prepareImportedMediaFiles(
  files: readonly File[],
  signal?: AbortSignal,
): Promise<readonly PreparedImportedMedia[]> {
  const preparedMedia: PreparedImportedMedia[] = [];

  for (const file of files) {
    preparedMedia.push(
      await prepareImportedFile(file, 'copied-indexeddb', null, signal),
    );
  }

  return preparedMedia;
}
