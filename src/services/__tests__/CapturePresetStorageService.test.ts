import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  deleteCapturePreset,
  listCapturePresets,
  resetCapturePresetDatabase,
  saveCapturePreset,
} from '../CapturePresetStorageService';
import type { CapturePresetRecord } from '../../types/capturePreset';

function createCapturePresetRecord(
  overrides: Partial<CapturePresetRecord> = {},
): CapturePresetRecord {
  const timestamp = overrides.updatedAt ?? Date.now();

  return {
    createdAt: overrides.createdAt ?? timestamp,
    description: overrides.description ?? 'Preset description.',
    id: overrides.id ?? `capture-${timestamp}`,
    isBundled: overrides.isBundled ?? false,
    label: overrides.label ?? 'Balanced Video',
    settings: overrides.settings ?? {
      burstCount: 3,
      countdownSeconds: 0,
      recordingProfileId: 'balanced',
      stillImageFormat: 'image/webp',
    },
    updatedAt: timestamp,
  };
}

describe('CapturePresetStorageService', (): void => {
  beforeEach(async (): Promise<void> => {
    await resetCapturePresetDatabase();
  });

  afterEach(async (): Promise<void> => {
    await resetCapturePresetDatabase();
  });

  it('stores capture presets newest first', async (): Promise<void> => {
    const older = createCapturePresetRecord({
      id: 'older',
      label: 'Older',
      updatedAt: 100,
    });
    const newer = createCapturePresetRecord({
      id: 'newer',
      label: 'Newer',
      updatedAt: 200,
    });

    await saveCapturePreset(older);
    await saveCapturePreset(newer);

    await expect(listCapturePresets()).resolves.toEqual([newer, older]);
  });

  it('deletes a capture preset', async (): Promise<void> => {
    const preset = createCapturePresetRecord({
      id: 'delete-me',
    });

    await saveCapturePreset(preset);
    await deleteCapturePreset(preset.id);

    await expect(listCapturePresets()).resolves.toEqual([]);
  });
});
