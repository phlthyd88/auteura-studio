import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  deleteLookPreset,
  listLookPresets,
  resetLookPresetDatabase,
  saveLookPreset,
} from '../LookPresetStorageService';
import { defaultColorGradingSettings, defaultTransformSettings } from '../../types/color';
import { RenderMode } from '../../types/render';
import type { LookPresetRecord } from '../../types/lookPreset';

function createLookPresetRecord(overrides: Partial<LookPresetRecord> = {}): LookPresetRecord {
  const timestamp = overrides.updatedAt ?? Date.now();

  return {
    createdAt: overrides.createdAt ?? timestamp,
    id: overrides.id ?? `look-${timestamp}`,
    name: overrides.name ?? 'Studio Clean',
    settings: overrides.settings ?? {
      activeLutId: null,
      colorGrading: defaultColorGradingSettings,
      mode: RenderMode.Passthrough,
      transform: defaultTransformSettings,
    },
    updatedAt: timestamp,
  };
}

describe('LookPresetStorageService', (): void => {
  beforeEach(async (): Promise<void> => {
    await resetLookPresetDatabase();
  });

  afterEach(async (): Promise<void> => {
    await resetLookPresetDatabase();
  });

  it('stores look presets newest first', async (): Promise<void> => {
    const older = createLookPresetRecord({
      id: 'older',
      updatedAt: 100,
      name: 'Older',
    });
    const newer = createLookPresetRecord({
      id: 'newer',
      updatedAt: 200,
      name: 'Newer',
    });

    await saveLookPreset(older);
    await saveLookPreset(newer);

    await expect(listLookPresets()).resolves.toEqual([newer, older]);
  });

  it('deletes a look preset', async (): Promise<void> => {
    const preset = createLookPresetRecord({
      id: 'delete-me',
    });

    await saveLookPreset(preset);
    await deleteLookPreset(preset.id);

    await expect(listLookPresets()).resolves.toEqual([]);
  });
});
