import type { TimelineProject } from '../models/Timeline';
import type {
  OfflinePackagingAuditSnapshot,
  PackagingStrategy,
} from '../types/platform';
import type {
  ImportedProjectPackageResult,
  ProjectPackageExportProgress,
  ProjectPackageExportResult,
  ProjectPackageManifest,
} from '../types/projectPackage';
import { getMediaDescriptorsByIds } from './MediaStorageService';
import { assertStorageWriteCompatible } from './AppCompatibilityService';
import {
  parseTimelineProjectRecord,
  storageSchemaVersion,
} from './storageSchemas';

interface SaveFilePickerWindow extends Window {
  showOpenFilePicker?: (options?: {
    readonly excludeAcceptAllOption?: boolean;
    readonly multiple?: boolean;
    readonly types?: readonly {
      readonly accept: Record<string, readonly string[]>;
      readonly description: string;
    }[];
  }) => Promise<readonly FileSystemFileHandle[]>;
  showSaveFilePicker?: (options?: {
    readonly excludeAcceptAllOption?: boolean;
    readonly suggestedName?: string;
    readonly types?: readonly {
      readonly accept: Record<string, readonly string[]>;
      readonly description: string;
    }[];
  }) => Promise<FileSystemFileHandle>;
}

const smallPackageByteLimit = 2 * 1024 * 1024;
const packageFileExtension = '.auteura-project.json';

function sanitizePackageFileName(name: string): string {
  return `${name.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'auteura-project'}${packageFileExtension}`;
}

function getProjectPackageCapability(): PackagingStrategy {
  if (typeof window !== 'undefined') {
    const saveFilePickerWindow = window as SaveFilePickerWindow;

    if (typeof saveFilePickerWindow.showSaveFilePicker === 'function') {
      return 'streaming-worker';
    }
  }

  return 'in-memory-small-package';
}

export function getOfflinePackagingAuditSnapshot(): OfflinePackagingAuditSnapshot {
  const packagingStrategy = getProjectPackageCapability();

  return {
    dependencyMode: 'fully-bundled',
    dynamicImportCount: 0,
    networkDependencyCount: 0,
    packageExportOfflineSafe: true,
    packageImportOfflineSafe: true,
    packagingStrategy,
    requiresPrecachedAssets: false,
  };
}

function createProjectPackageManifest(
  project: TimelineProject,
  referencedMedia: Awaited<ReturnType<typeof getMediaDescriptorsByIds>>,
  packagingStrategy: PackagingStrategy,
): ProjectPackageManifest {
  return {
    assetPayloadPolicy: 'external-references-only',
    createdAt: Date.now(),
    packageFormatVersion: 1,
    packageId: crypto.randomUUID(),
    packageMode: 'manifest-only',
    packagingStrategy,
    project,
    referencedMedia,
  };
}

function encodeChunk(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function* serializeProjectPackageManifest(
  manifest: ProjectPackageManifest,
): Generator<string, void, undefined> {
  yield '{';
  yield `"assetPayloadPolicy":${JSON.stringify(manifest.assetPayloadPolicy)},`;
  yield `"createdAt":${manifest.createdAt},`;
  yield `"packageFormatVersion":${manifest.packageFormatVersion},`;
  yield `"packageId":${JSON.stringify(manifest.packageId)},`;
  yield `"packageMode":${JSON.stringify(manifest.packageMode)},`;
  yield `"packagingStrategy":${JSON.stringify(manifest.packagingStrategy)},`;
  yield '"project":';
  yield JSON.stringify(manifest.project);
  yield ',"referencedMedia":[';

  for (let index = 0; index < manifest.referencedMedia.length; index += 1) {
    const descriptor = manifest.referencedMedia[index]!;

    if (index > 0) {
      yield ',';
    }

    yield JSON.stringify(descriptor);
  }

  yield ']}';
}

async function writePackageToFileHandle(
  fileHandle: FileSystemFileHandle,
  manifest: ProjectPackageManifest,
  signal: AbortSignal,
  onProgress?: (progress: ProjectPackageExportProgress) => void,
): Promise<number> {
  const writable = await fileHandle.createWritable();
  let bytesWritten = 0;

  try {
    onProgress?.({
      fraction: 0.5,
      stage: 'writing',
    });

    for (const chunk of serializeProjectPackageManifest(manifest)) {
      if (signal.aborted) {
        throw new DOMException('Package export cancelled.', 'AbortError');
      }

      await writable.write(chunk);
      bytesWritten += encodeChunk(chunk).byteLength;
    }

    await writable.close();
    return bytesWritten;
  } catch (error) {
    await writable.abort();
    throw error;
  }
}

function writeSmallPackageToDownload(
  fileName: string,
  manifest: ProjectPackageManifest,
  signal: AbortSignal,
  onProgress?: (progress: ProjectPackageExportProgress) => void,
): number {
  onProgress?.({
    fraction: 0.5,
    stage: 'serializing',
  });

  const chunks = [...serializeProjectPackageManifest(manifest)];
  const serializedManifest = chunks.join('');
  const manifestSizeBytes = encodeChunk(serializedManifest).byteLength;

  if (manifestSizeBytes > smallPackageByteLimit) {
    throw new Error(
      'This browser can only export small manifest packages without the File System Access API.',
    );
  }

  if (signal.aborted) {
    throw new DOMException('Package export cancelled.', 'AbortError');
  }

  const blob = new Blob(chunks, {
    type: 'application/json',
  });
  const objectUrl = URL.createObjectURL(blob);

  try {
    const linkElement = document.createElement('a');
    linkElement.href = objectUrl;
    linkElement.download = fileName;
    linkElement.click();
  } finally {
    window.setTimeout((): void => {
      URL.revokeObjectURL(objectUrl);
    }, 0);
  }

  return manifestSizeBytes;
}

function parseProjectPackageManifest(value: unknown): ProjectPackageManifest {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Project package is malformed.');
  }

  const record = value as Record<string, unknown>;

  if (record.packageFormatVersion !== 1 || record.packageMode !== 'manifest-only') {
    throw new Error('Unsupported project package format.');
  }

  if (!Array.isArray(record.referencedMedia) || typeof record.project !== 'object' || record.project === null) {
    throw new Error('Project package is incomplete.');
  }

  const now = Date.now();
  const validatedProject = parseTimelineProjectRecord({
    createdAt: now,
    id: typeof record.packageId === 'string' ? record.packageId : crypto.randomUUID(),
    project: record.project,
    schemaVersion: storageSchemaVersion,
    updatedAt: now,
  }).project;

  if (record.assetPayloadPolicy !== 'external-references-only') {
    throw new Error('Project package asset policy is unsupported.');
  }

  return {
    assetPayloadPolicy: 'external-references-only',
    createdAt:
      typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
        ? record.createdAt
        : Date.now(),
    packageFormatVersion: 1,
    packageId: typeof record.packageId === 'string' ? record.packageId : crypto.randomUUID(),
    packageMode: 'manifest-only',
    packagingStrategy:
      record.packagingStrategy === 'streaming-worker' ||
      record.packagingStrategy === 'in-memory-small-package'
        ? record.packagingStrategy
        : 'in-memory-small-package',
    project: validatedProject,
    referencedMedia: record.referencedMedia as ProjectPackageManifest['referencedMedia'],
  };
}

export async function exportProjectPackage(options: {
  readonly onProgress?: (progress: ProjectPackageExportProgress) => void;
  readonly project: TimelineProject;
  readonly signal: AbortSignal;
}): Promise<ProjectPackageExportResult> {
  assertStorageWriteCompatible();

  const { onProgress, project, signal } = options;
  const packagingStrategy = getProjectPackageCapability();
  const referencedMediaIds = [
    ...new Set(
      Object.values(project.clipLookup).map((clip): string => clip.source.mediaId),
    ),
  ];

  onProgress?.({
    fraction: 0.1,
    stage: 'preparing',
  });

  const referencedMedia = await getMediaDescriptorsByIds(referencedMediaIds);
  const manifest = createProjectPackageManifest(project, referencedMedia, packagingStrategy);
  const fileName = sanitizePackageFileName(project.name);

  if (signal.aborted) {
    throw new DOMException('Package export cancelled.', 'AbortError');
  }

  let bytesWritten = 0;

  if (packagingStrategy === 'streaming-worker' && typeof window !== 'undefined') {
    const saveFilePickerWindow = window as SaveFilePickerWindow;
    const fileHandle = await saveFilePickerWindow.showSaveFilePicker?.({
      excludeAcceptAllOption: true,
      suggestedName: fileName,
      types: [
        {
          accept: {
            'application/json': [packageFileExtension],
          },
          description: 'Auteura Project Package',
        },
      ],
    });

    if (fileHandle === undefined) {
      throw new Error('Project package export was cancelled before a destination was chosen.');
    }

    bytesWritten = await writePackageToFileHandle(fileHandle, manifest, signal, onProgress);
  } else {
    bytesWritten = writeSmallPackageToDownload(fileName, manifest, signal, onProgress);
  }

  onProgress?.({
    fraction: 1,
    stage: 'writing',
  });

  return {
    bytesWritten,
    fileName,
    packagingStrategy,
  };
}

export async function importProjectPackage(
  inputFile?: File,
): Promise<ImportedProjectPackageResult> {
  let selectedFile = inputFile;

  if (selectedFile === undefined) {
    const pickerWindow =
      typeof window === 'undefined' ? null : (window as SaveFilePickerWindow);

    if (pickerWindow === null || typeof pickerWindow.showOpenFilePicker !== 'function') {
      throw new Error('Project package import requires a selected package file.');
    }

    const [fileHandle] = await pickerWindow.showOpenFilePicker({
      excludeAcceptAllOption: true,
      multiple: false,
      types: [
        {
          accept: {
            'application/json': [packageFileExtension],
          },
          description: 'Auteura Project Package',
        },
      ],
    });

    if (fileHandle === undefined) {
      throw new Error('No project package was selected.');
    }

    selectedFile = await fileHandle.getFile();
  }

  const parsedManifest = parseProjectPackageManifest(
    JSON.parse(await selectedFile.text()),
  );
  const importedAt = Date.now();
  const importedProject: TimelineProject = {
    ...parsedManifest.project,
    id: crypto.randomUUID(),
    name: `${parsedManifest.project.name} (Imported)`,
    updatedAt: importedAt,
  };

  return {
    importedProject,
    referencedMediaCount: parsedManifest.referencedMedia.length,
  };
}
