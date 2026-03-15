import type { TimelineProject } from '../models/Timeline';
import type { PackagingStrategy } from './platform';
import type { MediaItem } from '../services/MediaStorageService';

export interface ProjectPackageMediaDescriptor {
  readonly captureMode: MediaItem['captureMode'];
  readonly createdAt: number;
  readonly durationMs?: number;
  readonly height?: number;
  readonly id: string;
  readonly isAvailable: boolean;
  readonly mimeType: string;
  readonly name: string;
  readonly origin: MediaItem['origin'];
  readonly sizeBytes: number;
  readonly storageKind: MediaItem['storageKind'];
  readonly timestamp: number;
  readonly type: MediaItem['type'];
  readonly width?: number;
}

export interface ProjectPackageManifest {
  readonly assetPayloadPolicy: 'external-references-only';
  readonly createdAt: number;
  readonly packageFormatVersion: 1;
  readonly packageId: string;
  readonly packageMode: 'manifest-only';
  readonly packagingStrategy: PackagingStrategy;
  readonly project: TimelineProject;
  readonly referencedMedia: readonly ProjectPackageMediaDescriptor[];
}

export interface ProjectPackageExportProgress {
  readonly fraction: number;
  readonly stage: 'preparing' | 'serializing' | 'writing';
}

export interface ProjectPackageExportResult {
  readonly bytesWritten: number;
  readonly fileName: string;
  readonly packagingStrategy: PackagingStrategy;
}

export interface ImportedProjectPackageResult {
  readonly importedProject: TimelineProject;
  readonly referencedMediaCount: number;
}
