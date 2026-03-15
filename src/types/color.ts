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
