export interface RGBColorBalance {
  readonly blue: number;
  readonly green: number;
  readonly red: number;
}

export interface ColorGradingSettings {
  readonly bypass: boolean;
  readonly contrast: number;
  readonly exposure: number;
  readonly gain: RGBColorBalance;
  readonly gamma: RGBColorBalance;
  readonly grain: number;
  readonly lift: RGBColorBalance;
  readonly lutIntensity: number;
  readonly saturation: number;
  readonly temperature: number;
  readonly tint: number;
  readonly vignette: number;
}

export interface TransformSettings {
  readonly flipX: boolean;
  readonly flipY: boolean;
  readonly panX: number;
  readonly panY: number;
  readonly rotationDeg: number;
  readonly zoom: number;
}

export const minimumTransformZoom = 1;
export const maximumTransformZoom = 2.5;

function getRotationTrigComponents(rotationDeg: number): { readonly cosine: number; readonly sine: number } {
  const radians = (rotationDeg * Math.PI) / 180;
  return {
    cosine: Math.cos(radians),
    sine: Math.sin(radians),
  };
}

function rotatePanOffsets(
  panX: number,
  panY: number,
  rotationDeg: number,
): { readonly x: number; readonly y: number } {
  const { cosine, sine } = getRotationTrigComponents(rotationDeg);
  return {
    x: cosine * panX - sine * panY,
    y: sine * panX + cosine * panY,
  };
}

function unrotatePanOffsets(
  rotatedPanX: number,
  rotatedPanY: number,
  rotationDeg: number,
): { readonly x: number; readonly y: number } {
  const { cosine, sine } = getRotationTrigComponents(rotationDeg);
  return {
    x: cosine * rotatedPanX + sine * rotatedPanY,
    y: -sine * rotatedPanX + cosine * rotatedPanY,
  };
}

export function getTransformMinimumZoom(settings: Pick<TransformSettings, 'panX' | 'panY' | 'rotationDeg'>): number {
  const { cosine, sine } = getRotationTrigComponents(settings.rotationDeg);
  const rotatedPanX = cosine * settings.panX - sine * settings.panY;
  const rotatedPanY = sine * settings.panX + cosine * settings.panY;
  const rotationalCropFloor = Math.max(minimumTransformZoom, Math.abs(cosine) + Math.abs(sine));

  return Math.max(
    rotationalCropFloor,
    rotationalCropFloor + Math.abs(rotatedPanX) * 2,
    rotationalCropFloor + Math.abs(rotatedPanY) * 2,
  );
}

export function getTransformPanLimit(zoom: number): number {
  return Math.max(0, (Math.max(minimumTransformZoom, zoom) - 1) / 2);
}

export function normalizeTransformSettings(settings: TransformSettings): TransformSettings {
  const requestedZoom = Math.max(minimumTransformZoom, settings.zoom);
  const requiredZoom = getTransformMinimumZoom(settings);
  const zoom = Math.min(maximumTransformZoom, Math.max(requestedZoom, requiredZoom));
  const rotationalCropFloor = getTransformMinimumZoom({
    panX: 0,
    panY: 0,
    rotationDeg: settings.rotationDeg,
  });
  const rotatedPanLimit = Math.max(0, (zoom - rotationalCropFloor) / 2);
  const rotatedPan = rotatePanOffsets(settings.panX, settings.panY, settings.rotationDeg);
  const clampedRotatedPanX = Math.max(-rotatedPanLimit, Math.min(rotatedPanLimit, rotatedPan.x));
  const clampedRotatedPanY = Math.max(-rotatedPanLimit, Math.min(rotatedPanLimit, rotatedPan.y));
  const panOffsets = unrotatePanOffsets(
    clampedRotatedPanX,
    clampedRotatedPanY,
    settings.rotationDeg,
  );

  return {
    ...settings,
    panX: panOffsets.x,
    panY: panOffsets.y,
    zoom,
  };
}

export interface LutDefinition {
  readonly category?: 'broadcast' | 'cinematic' | 'neutral' | 'stylized';
  readonly description?: string;
  readonly fileName?: string;
  readonly id: string;
  readonly importedAt?: number;
  readonly label: string;
  readonly notes?: string;
  readonly path: string;
  readonly sourceType: 'bundled' | 'imported';
  readonly tags?: readonly string[];
}

export interface LoadedLut {
  readonly cacheKey: string;
  readonly id: string;
  readonly label: string;
  readonly size: number;
  readonly textureData: Uint8Array;
  readonly textureHeight: number;
  readonly textureWidth: number;
}

export const defaultColorBalance: RGBColorBalance = {
  blue: 1,
  green: 1,
  red: 1,
};

export const defaultColorGradingSettings: ColorGradingSettings = {
  bypass: false,
  contrast: 1,
  exposure: 0,
  gain: defaultColorBalance,
  gamma: defaultColorBalance,
  grain: 0,
  lift: {
    blue: 0,
    green: 0,
    red: 0,
  },
  lutIntensity: 1,
  saturation: 1,
  temperature: 0,
  tint: 0,
  vignette: 0,
};

export const defaultTransformSettings: TransformSettings = {
  flipX: false,
  flipY: false,
  panX: 0,
  panY: 0,
  rotationDeg: 0,
  zoom: 1,
};
