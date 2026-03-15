import { describe, expect, it } from 'vitest';
import { defaultTimelineClipTransform, type TimelineClipEffect } from '../../../models/Timeline';
import {
  resolveClipEffectSettings,
  resolveEffectiveLayerTransform,
} from '../ClipEffectProcessor';

describe('ClipEffectProcessor helpers', (): void => {
  it('collects enabled clip effect settings deterministically', (): void => {
    const effects: readonly TimelineClipEffect[] = [
      {
        enabled: true,
        id: 'crop-a',
        label: 'Crop',
        left: 0.1,
        right: 0.05,
        top: 0.2,
        bottom: 0.15,
        type: 'crop',
      },
      {
        amount: 0.65,
        enabled: true,
        id: 'sharpen-a',
        label: 'Sharpen',
        type: 'sharpen',
      },
      {
        enabled: false,
        id: 'blur-a',
        label: 'Blur',
        radius: 0.8,
        type: 'blur',
      },
      {
        enabled: true,
        feather: 0.55,
        id: 'vignette-a',
        intensity: 0.4,
        label: 'Vignette',
        roundness: 0.7,
        type: 'vignette',
      },
    ];

    const settings = resolveClipEffectSettings(effects);

    expect(settings.crop?.id).toBe('crop-a');
    expect(settings.sharpenAmount).toBe(0.65);
    expect(settings.blurAmount).toBe(0);
    expect(settings.vignette?.id).toBe('vignette-a');
  });

  it('uses an enabled transform override when present', (): void => {
    const overrideTransform = {
      rotationDegrees: 14,
      scale: 1.35,
      x: 0.22,
      y: -0.18,
    };
    const effects: readonly TimelineClipEffect[] = [
      {
        enabled: true,
        id: 'transform-a',
        label: 'Transform Override',
        transform: overrideTransform,
        type: 'transform-override',
      },
    ];

    expect(resolveEffectiveLayerTransform(defaultTimelineClipTransform, effects)).toEqual(
      overrideTransform,
    );
  });
});
