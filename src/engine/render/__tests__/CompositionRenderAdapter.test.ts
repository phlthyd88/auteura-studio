import { describe, expect, it, vi } from 'vitest';
import { CompositionRenderAdapter } from '../CompositionRenderAdapter';
import type { TimelineCompositionInstruction } from '../../../types/compositor';
import type { RenderPerformanceState, RenderableSourceElement } from '../../../types/render';

function createInstruction(): TimelineCompositionInstruction {
  return {
    audioNodes: [],
    layers: [
      {
        blendMode: 'normal',
        clipId: 'clip-a',
        clipOffsetMs: 500,
        effects: [
          {
            enabled: true,
            id: 'blur-a',
            label: 'Blur',
            radius: 0.7,
            type: 'blur',
          },
        ],
        mediaType: 'video',
        opacity: 1,
        remainingMs: 1500,
        sourceId: 'source-a',
        sourceOffsetMs: 500,
        trackId: 'track-a',
        trackIndex: 0,
        transform: {
          rotationDegrees: 0,
          scale: 1,
          x: 0,
          y: 0,
        },
        zIndex: 0,
      },
      {
        blendMode: 'add',
        clipId: 'clip-b',
        clipOffsetMs: 200,
        effects: [
          {
            enabled: true,
            feather: 0.5,
            id: 'vignette-b',
            intensity: 0.3,
            label: 'Vignette',
            roundness: 0.8,
            type: 'vignette',
          },
        ],
        mediaType: 'video',
        opacity: 0.85,
        remainingMs: 1800,
        sourceId: 'source-b',
        sourceOffsetMs: 200,
        trackId: 'track-b',
        trackIndex: 1,
        transform: {
          rotationDegrees: 0,
          scale: 1.1,
          x: 0.12,
          y: -0.08,
        },
        zIndex: 1,
      },
    ],
    metadata: {
      audioContextTimeSeconds: null,
      frameDurationMs: 1000 / 60,
      isPlaying: true,
      playheadMs: 1200,
    },
    policy: {
      exportMode: false,
      previewQualityScale: 0.75,
    },
    transitions: [
      {
        clipId: 'clip-b',
        curve: 'ease-in-out',
        durationMs: 700,
        placement: 'in',
        progress: 0.4,
        sourceA: 'transition-source-a',
        sourceAOffsetMs: 100,
        sourceB: 'source-b',
        sourceBOffsetMs: 200,
        trackId: 'track-b',
        transitionId: 'transition-b',
        type: 'slide-left',
      },
    ],
  };
}

function createBasePerformance(
  overrides: Partial<RenderPerformanceState> = {},
): RenderPerformanceState {
  return {
    bypassHeavyPreviewPasses: false,
    exportMode: false,
    isPlaybackActive: true,
    qualityScale: 0.65,
    ...overrides,
  };
}

describe('CompositionRenderAdapter', (): void => {
  it('collapses to the top-most layer in constrained preview while preserving policy', (): void => {
    const adapter = new CompositionRenderAdapter();
    const instruction = createInstruction();

    adapter.setInstruction(instruction);

    const renderState = adapter.deriveRenderState(
      createBasePerformance({
        bypassHeavyPreviewPasses: true,
      }),
    );

    expect(renderState.composition?.layers).toHaveLength(1);
    expect(renderState.composition?.layers[0]?.clipId).toBe('clip-b');
    expect(renderState.compositionLayerBindings).toHaveLength(1);
    expect(renderState.compositionLayerBindings[0]?.effects[0]?.type).toBe('vignette');
    expect(renderState.performance.qualityScale).toBeCloseTo(0.65, 5);
    expect(renderState.performance.bypassHeavyPreviewPasses).toBe(true);
    expect(renderState.passDirectives.bypassPassIds).toContain('mask-refinement');
    expect(renderState.composition?.transitions[0]?.type).toBe('slide-left');
  });

  it('preserves the full composition stack and disables preview bypass in export mode', (): void => {
    const adapter = new CompositionRenderAdapter();
    const instruction = createInstruction();

    adapter.setInstruction(instruction);

    const renderState = adapter.deriveRenderState(
      createBasePerformance({
        exportMode: true,
      }),
    );

    expect(renderState.composition?.layers).toHaveLength(2);
    expect(renderState.compositionLayerBindings).toHaveLength(2);
    expect(renderState.compositionLayerBindings[0]?.effects[0]?.type).toBe('blur');
    expect(renderState.compositionLayerBindings[1]?.effects[0]?.type).toBe('vignette');
    expect(renderState.performance.exportMode).toBe(true);
    expect(renderState.performance.qualityScale).toBe(1);
    expect(renderState.passDirectives.bypassPassIds).toHaveLength(0);
  });

  it('synchronizes active layer and transition sources and releases stale textures', (): void => {
    const adapter = new CompositionRenderAdapter();
    const instruction = createInstruction();
    const updateExternalTexture = vi.fn();
    const releaseExternalTexture = vi.fn();
    const resourcePool = {
      getExternalTextureIds: (): readonly string[] => ['source-a', 'stale-source'],
      releaseExternalTexture,
      updateExternalTexture,
    };
    const fakeContext = {} as WebGLRenderingContext;
    const fakeSourceElement = {
      height: 720,
      width: 1280,
    } as RenderableSourceElement;

    adapter.bindSource('source-a', fakeSourceElement);
    adapter.bindSource('source-b', fakeSourceElement);
    adapter.bindSource('transition-source-a', fakeSourceElement);
    adapter.setInstruction(instruction);

    adapter.synchronizeSourceTextures(
      fakeContext,
      resourcePool as unknown as import('../../ResourcePool').ResourcePool,
    );

    expect(updateExternalTexture).toHaveBeenCalledTimes(3);
    expect(updateExternalTexture).toHaveBeenCalledWith(fakeContext, 'source-a', fakeSourceElement);
    expect(updateExternalTexture).toHaveBeenCalledWith(fakeContext, 'source-b', fakeSourceElement);
    expect(updateExternalTexture).toHaveBeenCalledWith(
      fakeContext,
      'transition-source-a',
      fakeSourceElement,
    );
    expect(releaseExternalTexture).toHaveBeenCalledWith(fakeContext, 'stale-source');
  });
});
