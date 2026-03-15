export interface CameraResolutionOption {
  readonly height: number | null;
  readonly id: string;
  readonly label: string;
  readonly width: number | null;
}

export interface CameraFormatSettings {
  readonly aspectRatio: number | null;
  readonly deviceId: string | null;
  readonly frameRate: number | null;
  readonly height: number | null;
  readonly width: number | null;
}

export interface CameraCapabilitySummary {
  readonly aspectRatioRange: readonly [number, number] | null;
  readonly frameRateRange: readonly [number, number] | null;
  readonly heightRange: readonly [number, number] | null;
  readonly supportsFrameRateControl: boolean;
  readonly supportsHeightControl: boolean;
  readonly supportsPan: boolean;
  readonly supportsTilt: boolean;
  readonly supportsTorch: boolean;
  readonly supportsWidthControl: boolean;
  readonly supportsZoom: boolean;
  readonly widthRange: readonly [number, number] | null;
  readonly zoomRange: readonly [number, number] | null;
}

interface ExtendedMediaTrackCapabilities extends MediaTrackCapabilities {
  readonly pan?: boolean[] | MediaSettingsRange;
  readonly tilt?: boolean[] | MediaSettingsRange;
  readonly torch?: boolean[];
  readonly zoom?: MediaSettingsRange;
}

const baseResolutionOptions: readonly CameraResolutionOption[] = [
  {
    height: null,
    id: 'auto',
    label: 'Auto',
    width: null,
  },
  {
    height: 720,
    id: '1280x720',
    label: '720p',
    width: 1280,
  },
  {
    height: 1080,
    id: '1920x1080',
    label: '1080p',
    width: 1920,
  },
  {
    height: 1440,
    id: '2560x1440',
    label: '1440p',
    width: 2560,
  },
  {
    height: 2160,
    id: '3840x2160',
    label: '4K',
    width: 3840,
  },
];

function parseResolutionId(resolutionId: string): CameraResolutionOption | null {
  const match = /^(\d+)x(\d+)$/u.exec(resolutionId);

  if (match === null) {
    return null;
  }

  const width = Number(match[1]);
  const height = Number(match[2]);

  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    return null;
  }

  return {
    height,
    id: `${width}x${height}`,
    label: `${width} x ${height}`,
    width,
  };
}

function inNumericRange(
  value: number,
  range: readonly [number, number] | null,
): boolean {
  if (range === null) {
    return true;
  }

  return value >= range[0] && value <= range[1];
}

function normalizeFiniteNumber(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeRange(
  minValue: number | undefined,
  maxValue: number | undefined,
): readonly [number, number] | null {
  const normalizedMin = normalizeFiniteNumber(minValue);
  const normalizedMax = normalizeFiniteNumber(maxValue);

  if (normalizedMin === null || normalizedMax === null) {
    return null;
  }

  return [normalizedMin, normalizedMax];
}

export function buildCameraConstraints(input: {
  readonly activeDeviceId: string | null;
  readonly selectedFrameRate: number | null;
  readonly selectedResolution: CameraResolutionOption;
}): MediaStreamConstraints {
  const videoConstraints: MediaTrackConstraints = {};

  if (input.activeDeviceId !== null) {
    videoConstraints.deviceId = {
      exact: input.activeDeviceId,
    };
  }

  if (
    input.selectedResolution.width !== null &&
    input.selectedResolution.height !== null
  ) {
    videoConstraints.width = {
      ideal: input.selectedResolution.width,
    };
    videoConstraints.height = {
      ideal: input.selectedResolution.height,
    };
  }

  if (input.selectedFrameRate !== null) {
    videoConstraints.frameRate = {
      ideal: input.selectedFrameRate,
    };
  }

  return {
    audio: false,
    video: Object.keys(videoConstraints).length === 0 ? true : videoConstraints,
  };
}

export function resolveRequestedResolutionOption(
  resolutionId: string,
): CameraResolutionOption {
  if (resolutionId === 'auto') {
    return baseResolutionOptions[0] ?? {
      height: null,
      id: 'auto',
      label: 'Auto',
      width: null,
    };
  }

  const builtInOption = baseResolutionOptions.find(
    (option: CameraResolutionOption): boolean => option.id === resolutionId,
  );

  if (builtInOption !== undefined) {
    return builtInOption;
  }

  return (
    parseResolutionId(resolutionId) ?? {
      height: null,
      id: 'auto',
      label: 'Auto',
      width: null,
    }
  );
}

export function getCurrentCameraSettings(
  track: MediaStreamTrack | undefined,
): CameraFormatSettings | null {
  if (track === undefined) {
    return null;
  }

  const settings = track.getSettings();

  return {
    aspectRatio: normalizeFiniteNumber(settings.aspectRatio),
    deviceId: typeof settings.deviceId === 'string' ? settings.deviceId : null,
    frameRate: normalizeFiniteNumber(settings.frameRate),
    height: normalizeFiniteNumber(settings.height),
    width: normalizeFiniteNumber(settings.width),
  };
}

export function getCameraCapabilitySummary(
  track: MediaStreamTrack | undefined,
): CameraCapabilitySummary | null {
  if (track === undefined || typeof track.getCapabilities !== 'function') {
    return null;
  }

  const capabilities = track.getCapabilities() as ExtendedMediaTrackCapabilities;
  const widthRange = normalizeRange(capabilities.width?.min, capabilities.width?.max);
  const heightRange = normalizeRange(capabilities.height?.min, capabilities.height?.max);
  const frameRateRange = normalizeRange(
    capabilities.frameRate?.min,
    capabilities.frameRate?.max,
  );
  const aspectRatioRange = normalizeRange(
    capabilities.aspectRatio?.min,
    capabilities.aspectRatio?.max,
  );
  const zoomRange = normalizeRange(capabilities.zoom?.min, capabilities.zoom?.max);

  return {
    aspectRatioRange,
    frameRateRange,
    heightRange,
    supportsFrameRateControl: frameRateRange !== null,
    supportsHeightControl: heightRange !== null,
    supportsPan: Array.isArray(capabilities.pan) || zoomRange !== null,
    supportsTilt: Array.isArray(capabilities.tilt),
    supportsTorch: Array.isArray(capabilities.torch)
      ? capabilities.torch.includes(true)
      : false,
    supportsWidthControl: widthRange !== null,
    supportsZoom: zoomRange !== null,
    widthRange,
    zoomRange,
  };
}

export function getResolutionOptions(input: {
  readonly capabilitySummary: CameraCapabilitySummary | null;
  readonly currentSettings: CameraFormatSettings | null;
}): readonly CameraResolutionOption[] {
  const filteredOptions = baseResolutionOptions.filter(
    (option: CameraResolutionOption): boolean => {
      if (option.width === null || option.height === null) {
        return true;
      }

      return (
        inNumericRange(option.width, input.capabilitySummary?.widthRange ?? null) &&
        inNumericRange(option.height, input.capabilitySummary?.heightRange ?? null)
      );
    },
  );

  const currentWidth = input.currentSettings?.width;
  const currentHeight = input.currentSettings?.height;

  if (
    currentWidth == null ||
    currentHeight == null ||
    filteredOptions.some(
      (option: CameraResolutionOption): boolean =>
        option.width === currentWidth && option.height === currentHeight,
    )
  ) {
    return filteredOptions;
  }

  return [
    ...filteredOptions,
    {
      height: currentHeight,
      id: `${currentWidth}x${currentHeight}`,
      label: `${currentWidth} x ${currentHeight}`,
      width: currentWidth,
    },
  ];
}

export function getFrameRateOptions(input: {
  readonly capabilitySummary: CameraCapabilitySummary | null;
  readonly currentSettings: CameraFormatSettings | null;
}): readonly number[] {
  const candidates = [24, 25, 30, 48, 50, 60];
  const filteredCandidates = candidates.filter((candidate: number): boolean =>
    inNumericRange(candidate, input.capabilitySummary?.frameRateRange ?? null),
  );
  const currentFrameRate = input.currentSettings?.frameRate;

  if (
    currentFrameRate == null ||
    filteredCandidates.some(
      (candidate: number): boolean => candidate === Math.round(currentFrameRate),
    )
  ) {
    return filteredCandidates;
  }

  return [...filteredCandidates, Math.round(currentFrameRate)].sort((left, right) => left - right);
}
