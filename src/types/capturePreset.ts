export type StillImageFormat = 'image/png' | 'image/webp';

export interface CapturePresetSettings {
  readonly burstCount: number;
  readonly countdownSeconds: number;
  readonly recordingProfileId: string;
  readonly stillImageFormat: StillImageFormat;
}

export interface CapturePresetRecord {
  readonly createdAt: number;
  readonly description: string;
  readonly id: string;
  readonly isBundled: boolean;
  readonly label: string;
  readonly settings: CapturePresetSettings;
  readonly updatedAt: number;
}

export const bundledCapturePresets: readonly CapturePresetRecord[] = [
  {
    createdAt: 0,
    description: 'Balanced bitrate with quick still capture defaults.',
    id: 'balanced-video',
    isBundled: true,
    label: 'Balanced Video',
    settings: {
      burstCount: 3,
      countdownSeconds: 0,
      recordingProfileId: 'balanced',
      stillImageFormat: 'image/webp',
    },
    updatedAt: 0,
  },
  {
    createdAt: 0,
    description: 'Higher still-image fidelity with a short countdown.',
    id: 'clean-photo',
    isBundled: true,
    label: 'Clean Photo',
    settings: {
      burstCount: 1,
      countdownSeconds: 3,
      recordingProfileId: 'quality',
      stillImageFormat: 'image/png',
    },
    updatedAt: 0,
  },
  {
    createdAt: 0,
    description: 'Fast burst setup for action or expression selects.',
    id: 'burst-action',
    isBundled: true,
    label: 'Burst Action',
    settings: {
      burstCount: 5,
      countdownSeconds: 0,
      recordingProfileId: 'compact',
      stillImageFormat: 'image/webp',
    },
    updatedAt: 0,
  },
];

