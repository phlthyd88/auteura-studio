import { describe, expect, it } from 'vitest';
import { createEmptyTimelineProject } from '../../models/Timeline';
import { defaultColorGradingSettings, defaultTransformSettings } from '../../types/color';
import { RenderMode } from '../../types/render';
import {
  parseCapturePresetRecord,
  parseImportedLutRecord,
  parseLookPresetRecord,
  parseTimelineProjectRecord,
  storageSchemaVersion,
  toPersistedCapturePresetRecord,
  toPersistedImportedLutRecord,
  toPersistedLookPresetRecord,
  toPersistedTimelineProjectRecord,
} from '../storageSchemas';

describe('storageSchemas', (): void => {
  it('accepts legacy and versioned timeline project records', (): void => {
    const project = createEmptyTimelineProject('Legacy');
    const legacyRecord = {
      createdAt: project.createdAt,
      id: project.id,
      project,
      updatedAt: project.updatedAt,
    };

    expect(parseTimelineProjectRecord(legacyRecord).project.name).toBe('Legacy');
    expect(parseTimelineProjectRecord(toPersistedTimelineProjectRecord(project)).id).toBe(project.id);
  });

  it('rejects malformed timeline project records', (): void => {
    expect((): void => {
      parseTimelineProjectRecord({
        createdAt: Date.now(),
        id: 'broken-project',
        project: {
          id: 'broken-project',
        },
        updatedAt: Date.now(),
      });
    }).toThrow();
  });

  it('accepts versioned look, capture, and LUT records', (): void => {
    const lookPreset = toPersistedLookPresetRecord({
      createdAt: 1,
      id: 'look',
      name: 'Studio Clean',
      settings: {
        activeLutId: null,
        colorGrading: defaultColorGradingSettings,
        mode: RenderMode.Passthrough,
        transform: defaultTransformSettings,
      },
      updatedAt: 2,
    });
    const capturePreset = toPersistedCapturePresetRecord({
      createdAt: 1,
      description: 'Balanced capture settings.',
      id: 'capture',
      isBundled: false,
      label: 'Balanced',
      settings: {
        burstCount: 3,
        countdownSeconds: 0,
        recordingProfileId: 'balanced',
        stillImageFormat: 'image/webp',
      },
      updatedAt: 2,
    });
    const importedLut = toPersistedImportedLutRecord({
      createdAt: 1,
      fileName: 'sample.cube',
      id: 'lut',
      label: 'Imported LUT',
      sourceText: 'TITLE "Imported LUT"',
    });

    expect(parseLookPresetRecord(lookPreset).name).toBe('Studio Clean');
    expect(parseCapturePresetRecord(capturePreset).label).toBe('Balanced');
    expect(parseImportedLutRecord(importedLut).fileName).toBe('sample.cube');
  });

  it('rejects unsupported schema versions', (): void => {
    expect((): void => {
      parseLookPresetRecord({
        createdAt: 1,
        id: 'future-look',
        name: 'Future',
        schemaVersion: storageSchemaVersion + 1,
        settings: {
          activeLutId: null,
          colorGrading: defaultColorGradingSettings,
          mode: RenderMode.Passthrough,
          transform: defaultTransformSettings,
        },
        updatedAt: 2,
      });
    }).toThrow();
  });
});
