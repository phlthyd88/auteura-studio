export interface ScopeAnalysisData {
  readonly histogram: readonly number[];
  readonly rgbParade: {
    readonly blue: readonly number[];
    readonly green: readonly number[];
    readonly red: readonly number[];
  };
  readonly vectorscopePoints: readonly { readonly x: number; readonly y: number }[];
}

export interface ScopeAnalysisSettings {
  readonly enabled: boolean;
  readonly sampleFps: number;
  readonly sampleHeight: number;
  readonly sampleWidth: number;
}

export type ScopeAnalysisMode = 'cpu-sampled' | 'disabled';

export const emptyScopeAnalysis: ScopeAnalysisData = {
  histogram: Array.from({ length: 64 }, (): number => 0),
  rgbParade: {
    blue: Array.from({ length: 48 }, (): number => 0),
    green: Array.from({ length: 48 }, (): number => 0),
    red: Array.from({ length: 48 }, (): number => 0),
  },
  vectorscopePoints: [],
};

export function analyzeImageData(imageData: ImageData): ScopeAnalysisData {
  const { data, width, height } = imageData;
  const histogramBins = Array.from({ length: 64 }, (): number => 0);
  const paradeWidth = Math.max(24, Math.min(64, width));
  const redParade = Array.from({ length: paradeWidth }, (): number => 0);
  const greenParade = Array.from({ length: paradeWidth }, (): number => 0);
  const blueParade = Array.from({ length: paradeWidth }, (): number => 0);
  const paradeSamples = Array.from({ length: paradeWidth }, (): number => 0);
  const vectorscopePoints: Array<{ readonly x: number; readonly y: number }> = [];
  const xStep = Math.max(1, Math.floor(width / paradeWidth));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = (y * width + x) * 4;
      const red = data[pixelIndex] ?? 0;
      const green = data[pixelIndex + 1] ?? 0;
      const blue = data[pixelIndex + 2] ?? 0;
      const normalizedRed = red / 255;
      const normalizedGreen = green / 255;
      const normalizedBlue = blue / 255;
      const luma = 0.2126 * normalizedRed + 0.7152 * normalizedGreen + 0.0722 * normalizedBlue;
      const histogramIndex = Math.min(
        histogramBins.length - 1,
        Math.floor(luma * (histogramBins.length - 1)),
      );

      histogramBins[histogramIndex] = (histogramBins[histogramIndex] ?? 0) + 1;

      const paradeIndex = Math.min(paradeWidth - 1, Math.floor(x / xStep));
      redParade[paradeIndex] = (redParade[paradeIndex] ?? 0) + normalizedRed;
      greenParade[paradeIndex] = (greenParade[paradeIndex] ?? 0) + normalizedGreen;
      blueParade[paradeIndex] = (blueParade[paradeIndex] ?? 0) + normalizedBlue;
      paradeSamples[paradeIndex] = (paradeSamples[paradeIndex] ?? 0) + 1;

      if ((x + y) % 6 === 0 && vectorscopePoints.length < 800) {
        const u = -0.14713 * normalizedRed - 0.28886 * normalizedGreen + 0.436 * normalizedBlue;
        const v = 0.615 * normalizedRed - 0.51499 * normalizedGreen - 0.10001 * normalizedBlue;

        vectorscopePoints.push({
          x: Math.min(1, Math.max(0, 0.5 + u * 1.2)),
          y: Math.min(1, Math.max(0, 0.5 - v * 1.2)),
        });
      }
    }
  }

  return {
    histogram: histogramBins.map((bin: number): number =>
      height * width === 0 ? 0 : bin / (height * width),
    ),
    rgbParade: {
      blue: blueParade.map((value: number, index: number): number =>
        (paradeSamples[index] ?? 0) === 0 ? 0 : value / (paradeSamples[index] ?? 1),
      ),
      green: greenParade.map((value: number, index: number): number =>
        (paradeSamples[index] ?? 0) === 0 ? 0 : value / (paradeSamples[index] ?? 1),
      ),
      red: redParade.map((value: number, index: number): number =>
        (paradeSamples[index] ?? 0) === 0 ? 0 : value / (paradeSamples[index] ?? 1),
      ),
    },
    vectorscopePoints,
  };
}

export class ScopeAnalyzer {
  private readonly scratchCanvas: HTMLCanvasElement;

  private readonly scratchContext: CanvasRenderingContext2D;

  public constructor(
    private readonly sampleWidth: number,
    private readonly sampleHeight: number,
  ) {
    this.scratchCanvas = document.createElement('canvas');
    this.scratchCanvas.width = sampleWidth;
    this.scratchCanvas.height = sampleHeight;
    const context = this.scratchCanvas.getContext('2d', {
      willReadFrequently: true,
    });

    if (context === null) {
      throw new Error('Scope analysis could not acquire a 2D sampling context.');
    }

    this.scratchContext = context;
  }

  analyzeCanvas(sourceCanvas: HTMLCanvasElement): ScopeAnalysisData {
    if (sourceCanvas.width === 0 || sourceCanvas.height === 0) {
      return emptyScopeAnalysis;
    }

    this.scratchContext.clearRect(0, 0, this.sampleWidth, this.sampleHeight);
    this.scratchContext.drawImage(sourceCanvas, 0, 0, this.sampleWidth, this.sampleHeight);
    const imageData = this.scratchContext.getImageData(0, 0, this.sampleWidth, this.sampleHeight);
    return analyzeImageData(imageData);
  }
}
