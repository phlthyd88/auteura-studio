import { storageSchemaVersion } from './storageSchemas';

const compatibilityStorageKey = 'auteura:app-compatibility';
let inMemoryCompatibilityStorage: string | null = null;

export interface PersistedCompatibilityMetadata {
  readonly buildId: string;
  readonly lastWriterBuildId: string;
  readonly maxSeenSchemaVersion: number;
  readonly updatedAt: number;
}

export interface AppCompatibilitySnapshot {
  readonly buildId: string;
  readonly currentSchemaVersion: number;
  readonly isWriteBlocked: boolean;
  readonly refreshRecommended: boolean;
  readonly reason: string | null;
  readonly storedMetadata: PersistedCompatibilityMetadata | null;
}

function getCurrentBuildId(): string {
  const globalBuildId = (globalThis as { __AUTEURA_BUILD_ID__?: string }).__AUTEURA_BUILD_ID__;
  return typeof globalBuildId === 'string' && globalBuildId.length > 0
    ? globalBuildId
    : 'local-dev-build';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function getStorage(): Storage | null {
  if ('localStorage' in globalThis && globalThis.localStorage !== undefined) {
    return globalThis.localStorage;
  }

  return null;
}

function parsePersistedCompatibilityMetadata(value: unknown): PersistedCompatibilityMetadata | null {
  const record = asRecord(value);

  if (record === null) {
    return null;
  }

  const buildId = typeof record.buildId === 'string' ? record.buildId : null;
  const lastWriterBuildId =
    typeof record.lastWriterBuildId === 'string' ? record.lastWriterBuildId : null;
  const maxSeenSchemaVersion =
    typeof record.maxSeenSchemaVersion === 'number' && Number.isFinite(record.maxSeenSchemaVersion)
      ? record.maxSeenSchemaVersion
      : null;
  const updatedAt =
    typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
      ? record.updatedAt
      : null;

  if (
    buildId === null ||
    lastWriterBuildId === null ||
    maxSeenSchemaVersion === null ||
    updatedAt === null
  ) {
    return null;
  }

  return {
    buildId,
    lastWriterBuildId,
    maxSeenSchemaVersion,
    updatedAt,
  };
}

export function readPersistedCompatibilityMetadata(): PersistedCompatibilityMetadata | null {
  const storage = getStorage();

  try {
    const rawValue =
      storage === null ? inMemoryCompatibilityStorage : storage.getItem(compatibilityStorageKey);

    if (rawValue === null) {
      return null;
    }

    return parsePersistedCompatibilityMetadata(JSON.parse(rawValue));
  } catch {
    return null;
  }
}

function writePersistedCompatibilityMetadata(metadata: PersistedCompatibilityMetadata): void {
  const storage = getStorage();
  const serializedMetadata = JSON.stringify(metadata);

  if (storage === null) {
    inMemoryCompatibilityStorage = serializedMetadata;
  } else {
    storage.setItem(compatibilityStorageKey, serializedMetadata);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('auteura:compatibility-updated'));
  }
}

export function getAppCompatibilitySnapshot(): AppCompatibilitySnapshot {
  const storedMetadata = readPersistedCompatibilityMetadata();
  const buildId = getCurrentBuildId();
  const isWriteBlocked =
    storedMetadata !== null && storedMetadata.maxSeenSchemaVersion > storageSchemaVersion;

  return {
    buildId,
    currentSchemaVersion: storageSchemaVersion,
    isWriteBlocked,
    reason: isWriteBlocked
      ? 'Stored project data was written by a newer Auteura build. Refresh to load a compatible offline client before making changes.'
      : null,
    refreshRecommended:
      storedMetadata !== null &&
      storedMetadata.lastWriterBuildId !== buildId &&
      storedMetadata.maxSeenSchemaVersion === storageSchemaVersion,
    storedMetadata,
  };
}

export function registerCurrentClientCompatibility(): AppCompatibilitySnapshot {
  const currentSnapshot = getAppCompatibilitySnapshot();
  const nextMetadata: PersistedCompatibilityMetadata = {
    buildId: currentSnapshot.buildId,
    lastWriterBuildId:
      currentSnapshot.storedMetadata?.lastWriterBuildId ?? currentSnapshot.buildId,
    maxSeenSchemaVersion: Math.max(
      currentSnapshot.storedMetadata?.maxSeenSchemaVersion ?? storageSchemaVersion,
      storageSchemaVersion,
    ),
    updatedAt: Date.now(),
  };

  writePersistedCompatibilityMetadata(nextMetadata);

  return getAppCompatibilitySnapshot();
}

export function assertStorageWriteCompatible(): void {
  const snapshot = getAppCompatibilitySnapshot();

  if (snapshot.isWriteBlocked) {
    throw new Error(snapshot.reason ?? 'This cached client cannot safely write current local data.');
  }
}

export function markCurrentClientWrite(): void {
  const buildId = getCurrentBuildId();
  const currentMetadata = readPersistedCompatibilityMetadata();
  const nextMetadata: PersistedCompatibilityMetadata = {
    buildId,
    lastWriterBuildId: buildId,
    maxSeenSchemaVersion: Math.max(
      currentMetadata?.maxSeenSchemaVersion ?? storageSchemaVersion,
      storageSchemaVersion,
    ),
    updatedAt: Date.now(),
  };

  writePersistedCompatibilityMetadata(nextMetadata);
}

export function resetCompatibilityMetadataForTests(): void {
  const storage = getStorage();
  inMemoryCompatibilityStorage = null;

  if (storage !== null) {
    storage.removeItem(compatibilityStorageKey);
  }
}

export function writeCompatibilityMetadataForTests(
  metadata: PersistedCompatibilityMetadata,
): void {
  writePersistedCompatibilityMetadata(metadata);
}
