import type { TimelineCompositionVisualLayer } from '../../../types/compositor';
import type { RenderCompositionLayerBinding, RenderFrameState } from '../../../types/render';
import type { RenderGraphPass, RenderGraphResources } from '../../RenderGraph';
import {
  ClipEffectProcessor,
  resolveEffectiveLayerTransform,
} from '../ClipEffectProcessor';

interface LayerCompositePassResources {
  readonly opacityUniform: WebGLUniformLocation;
  readonly positionBuffer: WebGLBuffer;
  readonly positionLocation: number;
  readonly program: WebGLProgram;
  readonly scaleUniform: WebGLUniformLocation;
  readonly textureCoordBuffer: WebGLBuffer;
  readonly textureCoordLocation: number;
  readonly textureUniform: WebGLUniformLocation;
  readonly translationUniform: WebGLUniformLocation;
}

const vertexShaderSource = `
  attribute vec2 aPosition;
  attribute vec2 aTexCoord;
  varying vec2 vTexCoord;
  uniform vec2 uScale;
  uniform vec2 uTranslation;

  void main(void) {
    vec2 transformed = (aPosition * uScale) + uTranslation;
    gl_Position = vec4(transformed, 0.0, 1.0);
    vTexCoord = aTexCoord;
  }
`;

const fragmentShaderSource = `
  precision mediump float;

  varying vec2 vTexCoord;
  uniform sampler2D uTexture;
  uniform float uOpacity;

  void main(void) {
    vec4 color = texture2D(uTexture, vTexCoord);
    gl_FragColor = vec4(color.rgb, color.a * clamp(uOpacity, 0.0, 1.0));
  }
`;

function createShader(
  context: WebGLRenderingContext,
  shaderType: number,
  source: string,
): WebGLShader {
  const shader = context.createShader(shaderType);

  if (shader === null) {
    throw new Error('Failed to create a shader for layer compositing.');
  }

  context.shaderSource(shader, source);
  context.compileShader(shader);

  if (context.getShaderParameter(shader, context.COMPILE_STATUS) !== true) {
    const message = context.getShaderInfoLog(shader) ?? 'Unknown layer composite shader error.';
    context.deleteShader(shader);
    throw new Error(message);
  }

  return shader;
}

function createResources(context: WebGLRenderingContext): LayerCompositePassResources {
  const vertexShader = createShader(context, context.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = createShader(context, context.FRAGMENT_SHADER, fragmentShaderSource);
  const program = context.createProgram();

  if (program === null) {
    context.deleteShader(vertexShader);
    context.deleteShader(fragmentShader);
    throw new Error('Failed to create a layer composite program.');
  }

  context.attachShader(program, vertexShader);
  context.attachShader(program, fragmentShader);
  context.linkProgram(program);
  context.deleteShader(vertexShader);
  context.deleteShader(fragmentShader);

  if (context.getProgramParameter(program, context.LINK_STATUS) !== true) {
    const message = context.getProgramInfoLog(program) ?? 'Unknown layer composite link error.';
    context.deleteProgram(program);
    throw new Error(message);
  }

  const positionBuffer = context.createBuffer();
  const textureCoordBuffer = context.createBuffer();
  const positionLocation = context.getAttribLocation(program, 'aPosition');
  const textureCoordLocation = context.getAttribLocation(program, 'aTexCoord');
  const textureUniform = context.getUniformLocation(program, 'uTexture');
  const opacityUniform = context.getUniformLocation(program, 'uOpacity');
  const scaleUniform = context.getUniformLocation(program, 'uScale');
  const translationUniform = context.getUniformLocation(program, 'uTranslation');

  if (
    positionBuffer === null ||
    textureCoordBuffer === null ||
    positionLocation === -1 ||
    textureCoordLocation === -1 ||
    textureUniform === null ||
    opacityUniform === null ||
    scaleUniform === null ||
    translationUniform === null
  ) {
    if (positionBuffer !== null) {
      context.deleteBuffer(positionBuffer);
    }

    if (textureCoordBuffer !== null) {
      context.deleteBuffer(textureCoordBuffer);
    }

    context.deleteProgram(program);
    throw new Error('Failed to initialize layer composite attributes or uniforms.');
  }

  context.bindBuffer(context.ARRAY_BUFFER, positionBuffer);
  context.bufferData(
    context.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    context.STATIC_DRAW,
  );
  context.bindBuffer(context.ARRAY_BUFFER, textureCoordBuffer);
  context.bufferData(
    context.ARRAY_BUFFER,
    new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
    context.STATIC_DRAW,
  );

  context.useProgram(program);
  context.uniform1i(textureUniform, 0);

  return {
    opacityUniform,
    positionBuffer,
    positionLocation,
    program,
    scaleUniform,
    textureCoordBuffer,
    textureCoordLocation,
    textureUniform,
    translationUniform,
  };
}

function resolveRenderableLayers(frameState: RenderFrameState): readonly TimelineCompositionVisualLayer[] {
  if (frameState.composition === null) {
    return [];
  }

  const transitionSourceIds = new Set<string>();

  frameState.composition.transitions.forEach((transition): void => {
    if (transition.sourceA !== null) {
      transitionSourceIds.add(transition.sourceA);
    }

    transitionSourceIds.add(transition.sourceB);
  });

  return frameState.composition.layers.filter(
    (layer: TimelineCompositionVisualLayer): boolean => !transitionSourceIds.has(layer.sourceId),
  );
}

function applyBlendMode(
  context: WebGLRenderingContext,
  layer: TimelineCompositionVisualLayer,
  layerIndex: number,
): void {
  const isBaseLayer = layerIndex === 0 && layer.blendMode === 'normal' && layer.opacity >= 0.999;

  if (isBaseLayer) {
    context.disable(context.BLEND);
    return;
  }

  context.enable(context.BLEND);

  if (layer.blendMode === 'add') {
    context.blendFuncSeparate(
      context.SRC_ALPHA,
      context.ONE,
      context.ONE,
      context.ONE_MINUS_SRC_ALPHA,
    );
    return;
  }

  context.blendFuncSeparate(
    context.SRC_ALPHA,
    context.ONE_MINUS_SRC_ALPHA,
    context.ONE,
    context.ONE_MINUS_SRC_ALPHA,
  );
}

export class LayerCompositePass implements RenderGraphPass {
  private readonly clipEffectProcessor = new ClipEffectProcessor();

  private resources: LayerCompositePassResources | null = null;

  initialize(context: WebGLRenderingContext, graphResources: RenderGraphResources): void {
    if (this.resources !== null) {
      this.dispose(context, graphResources);
    }

    this.resources = createResources(context);
    this.clipEffectProcessor.initialize(context);
  }

  resize(
    _context: WebGLRenderingContext,
    _resources: RenderGraphResources,
    _width: number,
    _height: number,
  ): void {
    return;
  }

  render(
    context: WebGLRenderingContext,
    resources: RenderGraphResources,
    frameState: RenderFrameState,
  ): void {
    if (this.resources === null) {
      throw new Error('LayerCompositePass render invoked before initialization.');
    }

    const passResources = this.resources;

    if (frameState.composition === null) {
      return;
    }

    const layers = resolveRenderableLayers(frameState);
    const layerBindings = new Map<string, RenderCompositionLayerBinding>(
      frameState.compositionLayerBindings.map(
        (binding: RenderCompositionLayerBinding): readonly [string, RenderCompositionLayerBinding] => [
          binding.sourceId,
          binding,
        ],
      ),
    );

    context.bindFramebuffer(
      context.FRAMEBUFFER,
      resources.resourcePool.getFramebuffer('layerComposite'),
    );
    context.viewport(0, 0, resources.internalWidth, resources.internalHeight);
    context.clearColor(0, 0, 0, 0);
    context.clear(context.COLOR_BUFFER_BIT);
    context.useProgram(passResources.program);

    context.bindBuffer(context.ARRAY_BUFFER, passResources.positionBuffer);
    context.enableVertexAttribArray(passResources.positionLocation);
    context.vertexAttribPointer(passResources.positionLocation, 2, context.FLOAT, false, 0, 0);

    context.bindBuffer(context.ARRAY_BUFFER, passResources.textureCoordBuffer);
    context.enableVertexAttribArray(passResources.textureCoordLocation);
    context.vertexAttribPointer(passResources.textureCoordLocation, 2, context.FLOAT, false, 0, 0);

    layers.forEach((layer: TimelineCompositionVisualLayer, layerIndex: number): void => {
      const layerBinding = layerBindings.get(layer.sourceId);

      if (layerBinding === undefined || !layerBinding.sourceReady) {
        return;
      }

      const sourceTexture = resources.resourcePool.getExternalTexture(layerBinding.sourceTextureId);

      if (sourceTexture === null) {
        return;
      }

      const effectiveTransform = resolveEffectiveLayerTransform(
        layer.transform,
        layerBinding.effects,
      );
      const texture =
        this.clipEffectProcessor.processTexture(
          context,
          resources,
          sourceTexture,
          layerBinding.effects,
          'clipEffectA',
          frameState.performance.bypassHeavyPreviewPasses,
        );

      applyBlendMode(context, layer, layerIndex);
      context.activeTexture(context.TEXTURE0);
      context.bindTexture(context.TEXTURE_2D, texture);
      context.uniform1f(passResources.opacityUniform, layer.opacity);
      context.uniform2f(
        passResources.scaleUniform,
        Math.max(0.001, effectiveTransform.scale),
        Math.max(0.001, effectiveTransform.scale),
      );
      context.uniform2f(
        passResources.translationUniform,
        effectiveTransform.x,
        effectiveTransform.y,
      );
      context.drawArrays(context.TRIANGLE_STRIP, 0, 4);
    });

    context.disable(context.BLEND);
    context.bindFramebuffer(context.FRAMEBUFFER, null);
  }

  dispose(context: WebGLRenderingContext, _graphResources: RenderGraphResources): void {
    this.clipEffectProcessor.dispose(context);

    if (this.resources === null) {
      return;
    }

    context.deleteBuffer(this.resources.positionBuffer);
    context.deleteBuffer(this.resources.textureCoordBuffer);
    context.deleteProgram(this.resources.program);
    this.resources = null;
  }
}
