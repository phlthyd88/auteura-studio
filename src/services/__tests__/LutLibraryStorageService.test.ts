import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  deleteImportedLutRecord,
  getImportedLutRecord,
  listImportedLutRecords,
  resetLutLibraryDatabase,
  saveImportedLutRecord,
  type ImportedLutRecord,
} from '../LutLibraryStorageService';

function createImportedLutRecord(
  overrides: Partial<ImportedLutRecord> = {},
): ImportedLutRecord {
  const createdAt = overrides.createdAt ?? Date.now();

  return {
    createdAt,
    fileName: overrides.fileName ?? 'sample.cube',
    id: overrides.id ?? `imported:${createdAt}`,
    label: overrides.label ?? 'Sample LUT',
    notes: overrides.notes ?? 'Imported sample',
    sourceText:
      overrides.sourceText ??
      'LUT_3D_SIZE 2\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1',
    ...(overrides.description === undefined ? {} : { description: overrides.description }),
  };
}

describe('LutLibraryStorageService', (): void => {
  beforeEach(async (): Promise<void> => {
    await resetLutLibraryDatabase();
  });

  afterEach(async (): Promise<void> => {
    await resetLutLibraryDatabase();
  });

  it('stores and lists imported LUT records newest first', async (): Promise<void> => {
    const older = createImportedLutRecord({
      createdAt: 100,
      id: 'imported:older',
      label: 'Older',
    });
    const newer = createImportedLutRecord({
      createdAt: 200,
      id: 'imported:newer',
      label: 'Newer',
    });

    await saveImportedLutRecord(older);
    await saveImportedLutRecord(newer);

    await expect(listImportedLutRecords()).resolves.toEqual([newer, older]);
  });

  it('deletes imported LUT records cleanly', async (): Promise<void> => {
    const record = createImportedLutRecord({
      id: 'imported:delete-me',
    });

    await saveImportedLutRecord(record);
    await deleteImportedLutRecord(record.id);

    await expect(getImportedLutRecord(record.id)).resolves.toBeNull();
  });
});
