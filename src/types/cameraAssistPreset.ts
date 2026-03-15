import type { BeautySettings } from './beauty';
import type { VisionEnabledFeatures, VisionProcessingConfig } from './vision';

export type CameraAssistPresetId = 'balanced-live' | 'performance-safe' | 'portrait';

export interface CameraAssistRenderSettings {
  readonly showFrameGuide: boolean;
  readonly showGrid: boolean;
}

export interface CameraAssistPreset {
  readonly beautySettings: BeautySettings;
  readonly description: string;
  readonly enabledFeatures: VisionEnabledFeatures;
  readonly id: CameraAssistPresetId;
  readonly label: string;
  readonly processingConfig: VisionProcessingConfig;
  readonly renderSettings: CameraAssistRenderSettings;
}
