import { beforeEach, describe, expect, it } from 'vitest';
import {
  assertStorageWriteCompatible,
  getAppCompatibilitySnapshot,
  markCurrentClientWrite,
  registerCurrentClientCompatibility,
  resetCompatibilityMetadataForTests,
  writeCompatibilityMetadataForTests,
} from '../AppCompatibilityService';
import { storageSchemaVersion } from '../storageSchemas';

describe('AppCompatibilityService', (): void => {
  beforeEach((): void => {
    resetCompatibilityMetadataForTests();
  });

  it('registers the current client as compatible', (): void => {
    const snapshot = registerCurrentClientCompatibility();

    expect(snapshot.currentSchemaVersion).toBe(storageSchemaVersion);
    expect(snapshot.isWriteBlocked).toBe(false);
  });

  it('blocks writes when persisted schema is newer than the current client', (): void => {
    writeCompatibilityMetadataForTests({
      buildId: 'future-build',
      lastWriterBuildId: 'future-build',
      maxSeenSchemaVersion: storageSchemaVersion + 1,
      updatedAt: Date.now(),
    });

    expect(getAppCompatibilitySnapshot().isWriteBlocked).toBe(true);
    expect((): void => {
      assertStorageWriteCompatible();
    }).toThrow();
  });

  it('marks writes with the current build id', (): void => {
    registerCurrentClientCompatibility();
    markCurrentClientWrite();

    expect(getAppCompatibilitySnapshot().refreshRecommended).toBe(false);
    expect(getAppCompatibilitySnapshot().isWriteBlocked).toBe(false);
  });
});
