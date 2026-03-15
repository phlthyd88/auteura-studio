import { GLRenderer } from './GLRenderer';
import { RenderPipeline } from './RenderPipeline';
import { LayerCompositePass } from './render/passes/LayerCompositePass';
import { TransitionPass } from './render/passes/TransitionPass';
import { MaskRefinementPass } from './passes/MaskRefinementPass';
import { BeautyPass } from './passes/BeautyPass';
import { CoreColorPass } from './passes/CoreColorPass';
import { ComparisonPass } from './passes/ComparisonPass';
import { PictureInPicturePass } from './passes/PictureInPicturePass';

export function createStudioRenderer(canvas: HTMLCanvasElement): GLRenderer {
  const renderPipeline = new RenderPipeline([
    {
      id: 'layer-composite',
      isEnabled: (frameState): boolean => frameState.composition !== null,
      pass: new LayerCompositePass(),
    },
    {
      id: 'transition',
      isEnabled: (frameState): boolean =>
        frameState.composition !== null && frameState.composition.transitions.length > 0,
      pass: new TransitionPass(),
    },
    {
      id: 'mask-refinement',
      pass: new MaskRefinementPass(),
    },
    {
      id: 'beauty',
      isEnabled: (frameState): boolean =>
        frameState.aiState.beauty.active && frameState.aiState.faceRegions.length > 0,
      pass: new BeautyPass(),
    },
    {
      id: 'core-color',
      pass: new CoreColorPass(),
    },
    {
      id: 'comparison',
      pass: new ComparisonPass(),
    },
    {
      id: 'picture-in-picture',
      pass: new PictureInPicturePass(),
    },
  ]);

  return new GLRenderer(canvas, renderPipeline);
}
