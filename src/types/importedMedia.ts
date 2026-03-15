import type { MediaImportStrategy } from './platform';

export interface AuteuraFileSystemFileHandle {
  readonly kind: 'file';
  readonly name: string;
  getFile: () => Promise<File>;
}

export type ImportedMediaType = 'image' | 'video';
export type ImportedMediaStorageKind = 'copied-indexeddb' | 'file-system-handle';

export interface ImportedMediaCapability {
  readonly fileSystemAccessSupported: boolean;
  readonly preferredStrategy: MediaImportStrategy;
}

export interface PreparedImportedMedia {
  readonly durationMs?: number;
  readonly file: File;
  readonly fileHandle: AuteuraFileSystemFileHandle | null;
  readonly height?: number;
  readonly importStrategy: ImportedMediaStorageKind;
  readonly mimeType: string;
  readonly name: string;
  readonly sizeBytes: number;
  readonly thumbnail?: string;
  readonly timestamp: number;
  readonly type: ImportedMediaType;
  readonly width?: number;
}

