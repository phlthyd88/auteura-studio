export type OfflineCapability =
  | 'full-offline'
  | 'online-only'
  | 'partial-offline';

export type MediaImportStrategy =
  | 'copied-indexeddb'
  | 'file-system-handle'
  | 'unsupported';

export type PackagingStrategy =
  | 'in-memory-small-package'
  | 'streaming-worker'
  | 'unsupported';

export interface PlatformCapabilitySnapshot {
  readonly fileSystemAccessSupported: boolean;
  readonly mediaImportStrategy: MediaImportStrategy;
  readonly offlinePackagingCapability: OfflineCapability;
  readonly packagingStrategy: PackagingStrategy;
}

export interface OfflinePackagingAuditSnapshot {
  readonly dependencyMode: 'fully-bundled';
  readonly dynamicImportCount: number;
  readonly networkDependencyCount: number;
  readonly packageImportOfflineSafe: boolean;
  readonly packageExportOfflineSafe: boolean;
  readonly packagingStrategy: PackagingStrategy;
  readonly requiresPrecachedAssets: boolean;
}

export type VirtualCameraFeasibility =
  | 'browser-limited'
  | 'extension-only'
  | 'no-go-for-pwa';

export interface VirtualCameraFeasibilitySnapshot {
  readonly browserVirtualSourceFeasibility: 'conditional';
  readonly notes: readonly string[];
  readonly recommendedPath: 'tab-share-and-browser-virtual-source';
  readonly systemVirtualCameraFeasibility: VirtualCameraFeasibility;
}
