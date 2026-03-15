export type BeautyRenderQuality = 'full' | 'reduced';

export interface BeautySettings {
  readonly complexionBalancing: number;
  readonly detailPreservation: number;
  readonly enabled: boolean;
  readonly previewBypassUnderLoad: boolean;
  readonly skinSmoothing: number;
  readonly underEyeSoftening: number;
}

export interface BeautyRuntimeState {
  readonly active: boolean;
  readonly previewBypassed: boolean;
  readonly quality: BeautyRenderQuality;
  readonly settings: BeautySettings;
  readonly unavailableReason: string | null;
}

export const defaultBeautySettings: BeautySettings = {
  complexionBalancing: 0.2,
  detailPreservation: 0.7,
  enabled: false,
  previewBypassUnderLoad: true,
  skinSmoothing: 0.3,
  underEyeSoftening: 0.15,
};

export const defaultBeautyRuntimeState: BeautyRuntimeState = {
  active: false,
  previewBypassed: false,
  quality: 'full',
  settings: defaultBeautySettings,
  unavailableReason: null,
};
