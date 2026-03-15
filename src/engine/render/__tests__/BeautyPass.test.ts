import { describe, expect, it } from 'vitest';
import { defaultBeautyRuntimeState, defaultBeautySettings } from '../../../types/beauty';
import { defaultColorGradingSettings, defaultTransformSettings } from '../../../types/color';
import { defaultPictureInPictureConfig } from '../../../types/compositor';
import {
  defaultRenderComparisonConfig,
  defaultRenderMaskRefinementConfig,
  defaultRenderPassDirectives,
  RenderMode,
  type RenderFrameState,
} from '../../../types/render';
import { shouldRunBeautyPass } from '../../passes/BeautyPass';

function createFrameState(overrides: Partial<RenderFrameState> = {}): RenderFrameState {
  return {
    aiState: {
      backgroundBlurEnabled: false,
      backgroundBlurStrength: 0.65,
      beauty: defaultBeautyRuntimeState,
      faceRegions: [],
      segmentationMask: null,
    },
    activeLut: null,
    colorGrading: defaultColorGradingSettings,
    comparison: defaultRenderComparisonConfig,
    composition: null,
    compositionLayerBindings: [],
    maskRefinement: defaultRenderMaskRefinementConfig,
    mode: RenderMode.Passthrough,
    passDirectives: defaultRenderPassDirectives,
    performance: {
      bypassHeavyPreviewPasses: false,
      exportMode: false,
      isPlaybackActive: false,
      qualityScale: 1,
    },
    pictureInPicture: defaultPictureInPictureConfig,
    timeSeconds: 0,
    transform: defaultTransformSettings,
    ...overrides,
  };
}

describe('shouldRunBeautyPass', (): void => {
  it('returns false when portrait retouch is inactive', (): void => {
    expect(shouldRunBeautyPass(createFrameState())).toBe(false);
  });

  it('returns false when no face regions are available', (): void => {
    const frameState = createFrameState({
      aiState: {
        backgroundBlurEnabled: false,
        backgroundBlurStrength: 0.65,
        beauty: {
          ...defaultBeautyRuntimeState,
          active: true,
          settings: {
            ...defaultBeautySettings,
            enabled: true,
          },
        },
        faceRegions: [],
        segmentationMask: null,
      },
    });

    expect(shouldRunBeautyPass(frameState)).toBe(false);
  });

  it('returns true when portrait retouch is active and face regions are available', (): void => {
    const frameState = createFrameState({
      aiState: {
        backgroundBlurEnabled: false,
        backgroundBlurStrength: 0.65,
        beauty: {
          ...defaultBeautyRuntimeState,
          active: true,
          settings: {
            ...defaultBeautySettings,
            enabled: true,
          },
        },
        faceRegions: [
          {
            bounds: {
              center: { x: 0.5, y: 0.4 },
              height: 0.3,
              maxX: 0.65,
              maxY: 0.55,
              minX: 0.35,
              minY: 0.25,
              width: 0.3,
            },
            confidence: 0.95,
            kind: 'face',
          },
        ],
        segmentationMask: null,
      },
    });

    expect(shouldRunBeautyPass(frameState)).toBe(true);
  });
});
