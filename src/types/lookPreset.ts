import type { ColorGradingSettings, TransformSettings } from './color';
import type { RenderMode } from './render';

export interface LookPresetSettings {
  readonly activeLutId: string | null;
  readonly colorGrading: ColorGradingSettings;
  readonly mode: RenderMode;
  readonly transform: TransformSettings;
}

export interface LookPresetRecord {
  readonly createdAt: number;
  readonly id: string;
  readonly name: string;
  readonly settings: LookPresetSettings;
  readonly updatedAt: number;
}
