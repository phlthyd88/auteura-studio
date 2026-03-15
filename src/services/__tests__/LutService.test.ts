import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  deleteImportedLut,
  getAvailableLuts,
  importLutFile,
  loadLutById,
  resetLutLibraryDatabase,
} from '../LutService';

const sampleCube = `
TITLE "Sample"
LUT_3D_SIZE 2
DOMAIN_MIN 0 0 0
DOMAIN_MAX 1 1 1
0 0 0
1 0 0
0 1 0
1 1 0
0 0 1
1 0 1
0 1 1
1 1 1
`.trim();

describe('LutService', (): void => {
  beforeEach(async (): Promise<void> => {
    await resetLutLibraryDatabase();
  });

  afterEach(async (): Promise<void> => {
    await resetLutLibraryDatabase();
  });

  it('imports a cube file and exposes it in the LUT library', async (): Promise<void> => {
    const file = new File([sampleCube], 'Teal Memory.cube', {
      type: 'application/octet-stream',
    });

    const importedLut = await importLutFile(file);
    const availableLuts = await getAvailableLuts();

    expect(importedLut.sourceType).toBe('imported');
    expect(availableLuts.some((lut): boolean => lut.id === importedLut.id)).toBe(true);

    const loadedLut = await loadLutById(importedLut.id);

    expect(loadedLut.id).toBe(importedLut.id);
    expect(loadedLut.size).toBe(2);
    expect(loadedLut.textureWidth).toBe(4);
    expect(loadedLut.textureHeight).toBe(2);
  });

  it('rejects invalid import file types', async (): Promise<void> => {
    const file = new File(['not-a-cube'], 'bad.txt', {
      type: 'text/plain',
    });

    await expect(importLutFile(file)).rejects.toThrow('Only .cube LUT files can be imported.');
  });

  it('rejects oversized imported LUT files', async (): Promise<void> => {
    const largeCube = `${sampleCube}\n${'#'.repeat(600_000)}`;
    const file = new File([largeCube], 'oversized.cube', {
      type: 'application/octet-stream',
    });

    await expect(importLutFile(file)).rejects.toThrow(
      'Imported LUTs must be smaller than 512 KB.',
    );
  });

  it('removes imported LUTs without affecting bundled entries', async (): Promise<void> => {
    const file = new File([sampleCube], 'Delete Me.cube', {
      type: 'application/octet-stream',
    });

    const importedLut = await importLutFile(file);
    await deleteImportedLut(importedLut.id);

    const availableLuts = await getAvailableLuts();

    expect(availableLuts.some((lut): boolean => lut.id === importedLut.id)).toBe(false);
    expect(availableLuts.some((lut): boolean => lut.sourceType === 'bundled')).toBe(true);
  });

  it('evicts the oldest imported LUT records when the library budget is exceeded', async (): Promise<void> => {
    for (let index = 0; index < 25; index += 1) {
      const file = new File([sampleCube], `Look ${index}.cube`, {
        type: 'application/octet-stream',
      });

      await importLutFile(file);
    }

    const importedLuts = (await getAvailableLuts()).filter(
      (lut): boolean => lut.sourceType === 'imported',
    );

    expect(importedLuts).toHaveLength(24);
  });
});
