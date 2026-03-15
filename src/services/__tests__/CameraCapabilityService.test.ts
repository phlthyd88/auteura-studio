import { describe, expect, it } from 'vitest';
import {
  buildCameraConstraints,
  getResolutionOptions,
  resolveRequestedResolutionOption,
  type CameraCapabilitySummary,
  type CameraFormatSettings,
} from '../CameraCapabilityService';

describe('CameraCapabilityService', (): void => {
  it('builds strict device and format constraints from selected options', (): void => {
    const constraints = buildCameraConstraints({
      activeDeviceId: 'studio-cam',
      selectedFrameRate: 30,
      selectedResolution: {
        height: 1080,
        id: '1920x1080',
        label: '1080p',
        width: 1920,
      },
    });

    expect(constraints.audio).toBe(false);
    expect(constraints.video).toEqual({
      deviceId: {
        exact: 'studio-cam',
      },
      frameRate: {
        ideal: 30,
      },
      height: {
        ideal: 1080,
      },
      width: {
        ideal: 1920,
      },
    });
  });

  it('resolves custom resolutions and filters built-in options by capability range', (): void => {
    const capabilitySummary: CameraCapabilitySummary = {
      aspectRatioRange: null,
      frameRateRange: [24, 60],
      heightRange: [720, 1440],
      supportsFrameRateControl: true,
      supportsHeightControl: true,
      supportsPan: false,
      supportsTilt: false,
      supportsTorch: false,
      supportsWidthControl: true,
      supportsZoom: false,
      widthRange: [1280, 2560],
      zoomRange: null,
    };
    const currentSettings: CameraFormatSettings = {
      aspectRatio: 16 / 9,
      deviceId: 'studio-cam',
      frameRate: 30,
      height: 1080,
      width: 1920,
    };

    expect(resolveRequestedResolutionOption('2560x1440')).toEqual({
      height: 1440,
      id: '2560x1440',
      label: '1440p',
      width: 2560,
    });
    expect(
      getResolutionOptions({
        capabilitySummary,
        currentSettings,
      }).map((option) => option.id),
    ).toEqual(['auto', '1280x720', '1920x1080', '2560x1440']);
  });
});
