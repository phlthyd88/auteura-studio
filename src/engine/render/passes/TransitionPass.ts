import type {
  TimelineCompositionTransition,
  TimelineCompositionVisualLayer,
} from '../../../types/compositor';
import type { RenderCompositionLayerBinding, RenderFrameState } from '../../../types/render';
import type { RenderGraphPass, RenderGraphResources } from '../../RenderGraph';
import {
  ClipEffectProcessor,
  resolveEffectiveLayerTransform,
} from '../ClipEffectProcessor';

interface TransitionPassResources {
  readonly mixProgressUniform: WebGLUniformLocation;
  readonly opacityUniform: WebGLUniformLocation;
  readonly positionBuffer: WebGLBuffer;
  readonly positionLocation: number;
  readonly program: WebGLProgram;
  readonly scaleUniform: WebGLUniformLocation;
  readonly sourceATextureUniform: WebGLUniformLocation;
  readonly sourceBTextureUniform: WebGLUniformLocation;
  readonly textureCoordBuffer: WebGLBuffer;
  readonly textureCoordLocation: number;
  readonly transitionTypeUniform: WebGLUniformLocation;
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
  uniform sampler2D uSourceATexture;
  uniform sampler2D uSourceBTexture;
  uniform float uMixProgress;
  uniform float uOpacity;
  uniform int uTransitionType;

  vec4 sampleTransparent(sampler2D textureSampler, vec2 uv) {
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      return vec4(0.0, 0.0, 0.0, 0.0);
    }

    return texture2D(textureSampler, uv);
  }

  void main(void) {
    vec4 colorA = texture2D(uSourceATexture, vTexCoord);
    vec4 colorB = texture2D(uSourceBTexture, vTexCoord);
    float mixProgress = clamp(uMixProgress, 0.0, 1.0);
    vec4 outputColor = mix(colorA, colorB, mixProgress);

    if (uTransitionType == 1) {
      float fadeToBlack = mixProgress < 0.5
        ? 1.0 - (mixProgress * 2.0)
        : (mixProgress - 0.5) * 2.0;
      vec4 transitionColor = mixProgress < 0.5 ? colorA : colorB;
      outputColor = mix(vec4(0.0, 0.0, 0.0, 1.0), transitionColor, fadeToBlack);
    } else if (uTransitionType == 2) {
      float fadeToWhite = mixProgress < 0.5
        ? 1.0 - (mixProgress * 2.0)
        : (mixProgress - 0.5) * 2.0;
      vec4 transitionColor = mixProgress < 0.5 ? colorA : colorB;
      outputColor = mix(vec4(1.0, 1.0, 1.0, 1.0), transitionColor, fadeToWhite);
    } else if (uTransitionType == 3) {
      float mask = step(vTexCoord.x, mixProgress);
      outputColor = mix(colorA, colorB, mask);
    } else if (uTransitionType == 4) {
      float mask = step(1.0 - vTexCoord.x, mixProgress);
      outputColor = mix(colorA, colorB, mask);
    } else if (uTransitionType == 5) {
      vec4 slideA = sampleTransparent(uSourceATexture, vec2(vTexCoord.x + mixProgress, vTexCoord.y));
      vec4 slideB = sampleTransparent(uSourceBTexture, vec2(vTexCoord.x - (1.0 - mixProgress), vTexCoord.y));
      outputColor = mix(slideA, slideB, slideB.a);
    } else if (uTransitionType == 6) {
      vec4 slideA = sampleTransparent(uSourceATexture, vec2(vTexCoord.x - mixProgress, vTexCoord.y));
      vec4 slideB = sampleTransparent(uSourceBTexture, vec2(vTexCoord.x + (1.0 - mixProgress), vTexCoord.y));
      outputColor = mix(slideA, slideB, slideB.a);
    }

    gl_FragColor = vec4(outputColor.rgb, outputColor.a * clamp(uOpacity, 0.0, 1.0));
  }
`;

function createShader(
  context: WebGLRenderingContext,
  shaderType: number,
  source: string,
): WebGLShader {
  const shader = context.createShader(shaderType);

  if (shader === null) {
    throw new Error('Failed to create a shader for transition compositing.');
  }

  context.shaderSource(shader, source);
  context.compileShader(shader);

  if (context.getShaderParameter(shader, context.COMPILE_STATUS) !== true) {
    const message = context.getShaderInfoLog(shader) ?? 'Unknown transition shader error.';
    context.deleteShader(shader);
    throw new Error(message);
  }

  return shader;
}

function createResources(context: WebGLRenderingContext): TransitionPassResources {
  const vertexShader = createShader(context, context.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = createShader(context, context.FRAGMENT_SHADER, fragmentShaderSource);
  const program = context.createProgram();

  if (program === null) {
    context.deleteShader(vertexShader);
    context.deleteShader(fragmentShader);
    throw new Error('Failed to create a transition pass program.');
  }

  context.attachShader(program, vertexShader);
  context.attachShader(program, fragmentShader);
  context.linkProgram(program);
  context.deleteShader(vertexShader);
  context.deleteShader(fragmentShader);

  if (context.getProgramParameter(program, context.LINK_STATUS) !== true) {
    const message = context.getProgramInfoLog(program) ?? 'Unknown transition link error.';
    context.deleteProgram(program);
    throw new Error(message);
  }

  const positionBuffer = context.createBuffer();
  const textureCoordBuffer = context.createBuffer();
  const positionLocation = context.getAttribLocation(program, 'aPosition');
  const textureCoordLocation = context.getAttribLocation(program, 'aTexCoord');
  const sourceATextureUniform = context.getUniformLocation(program, 'uSourceATexture');
  const sourceBTextureUniform = context.getUniformLocation(program, 'uSourceBTexture');
  const mixProgressUniform = context.getUniformLocation(program, 'uMixProgress');
  const opacityUniform = context.getUniformLocation(program, 'uOpacity');
  const scaleUniform = context.getUniformLocation(program, 'uScale');
  const translationUniform = context.getUniformLocation(program, 'uTranslation');
  const transitionTypeUniform = context.getUniformLocation(program, 'uTransitionType');

  if (
    positionBuffer === null ||
    textureCoordBuffer === null ||
    positionLocation === -1 ||
    textureCoordLocation === -1 ||
    sourceATextureUniform === null ||
    sourceBTextureUniform === null ||
    mixProgressUniform === null ||
    opacityUniform === null ||
    scaleUniform === null ||
    translationUniform === null ||
    transitionTypeUniform === null
  ) {
    if (positionBuffer !== null) {
      context.deleteBuffer(positionBuffer);
    }

    if (textureCoordBuffer !== null) {
      context.deleteBuffer(textureCoordBuffer);
    }

    context.deleteProgram(program);
    throw new Error('Failed to initialize transition pass attributes or uniforms.');
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
  context.uniform1i(sourceATextureUniform, 0);
  context.uniform1i(sourceBTextureUniform, 1);

  return {
    mixProgressUniform,
    opacityUniform,
    positionBuffer,
    positionLocation,
    program,
    scaleUniform,
    sourceATextureUniform,
    sourceBTextureUniform,
    textureCoordBuffer,
    textureCoordLocation,
    transitionTypeUniform,
    translationUniform,
  };
}

function getLayerForTransition(
  layers: readonly TimelineCompositionVisualLayer[],
  transition: TimelineCompositionTransition,
): TimelineCompositionVisualLayer | null {
  const sourceBLayer = layers.find((layer) => layer.sourceId === transition.sourceB);

  if (sourceBLayer !== undefined) {
    return sourceBLayer;
  }

  if (transition.sourceA === null) {
    return null;
  }

  return layers.find((layer) => layer.sourceId === transition.sourceA) ?? null;
}

function getTransitionTypeValue(transition: TimelineCompositionTransition): number {
  switch (transition.type) {
    case 'dip-to-black':
      return 1;
    case 'dip-to-white':
      return 2;
    case 'wipe-left-to-right':
      return 3;
    case 'wipe-right-to-left':
      return 4;
    case 'slide-left':
      return 5;
    case 'slide-right':
      return 6;
    case 'crossfade':
    default:
      return 0;
  }
}

export class TransitionPass implements RenderGraphPass {
  private readonly clipEffectProcessor = new ClipEffectProcessor();

  private resources: TransitionPassResources | null = null;

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
    if (this.resources === null || frameState.composition === null) {
      return;
    }

    const passResources = this.resources;
    const layers = frameState.composition.layers;
    const transitions = frameState.composition.transitions;
    const layerBindings = new Map<string, RenderCompositionLayerBinding>(
      frameState.compositionLayerBindings.map(
        (binding: RenderCompositionLayerBinding): readonly [string, RenderCompositionLayerBinding] => [
          binding.sourceId,
          binding,
        ],
      ),
    );

    if (transitions.length === 0) {
      return;
    }

    context.bindFramebuffer(
      context.FRAMEBUFFER,
      resources.resourcePool.getFramebuffer('layerComposite'),
    );
    context.viewport(0, 0, resources.internalWidth, resources.internalHeight);
    context.useProgram(passResources.program);

    context.bindBuffer(context.ARRAY_BUFFER, passResources.positionBuffer);
    context.enableVertexAttribArray(passResources.positionLocation);
    context.vertexAttribPointer(passResources.positionLocation, 2, context.FLOAT, false, 0, 0);
    context.bindBuffer(context.ARRAY_BUFFER, passResources.textureCoordBuffer);
    context.enableVertexAttribArray(passResources.textureCoordLocation);
    context.vertexAttribPointer(passResources.textureCoordLocation, 2, context.FLOAT, false, 0, 0);

    context.enable(context.BLEND);
    context.blendFuncSeparate(
      context.SRC_ALPHA,
      context.ONE_MINUS_SRC_ALPHA,
      context.ONE,
      context.ONE_MINUS_SRC_ALPHA,
    );

    transitions.forEach((transition: TimelineCompositionTransition): void => {
      const sourceBBinding = layerBindings.get(transition.sourceB);
      const sourceBBaseTexture = resources.resourcePool.getExternalTexture(transition.sourceB);

      if (
        sourceBBaseTexture === null ||
        (sourceBBinding !== undefined && !sourceBBinding.sourceReady)
      ) {
        return;
      }

      const transitionLayer = getLayerForTransition(layers, transition);

      if (transitionLayer === null) {
        return;
      }

      const sourceBTexture = (() : WebGLTexture => {
        return sourceBBinding === undefined
          ? sourceBBaseTexture
          : this.clipEffectProcessor.processTexture(
              context,
              resources,
              sourceBBaseTexture,
              sourceBBinding.effects,
              'clipEffectB',
              frameState.performance.bypassHeavyPreviewPasses,
            );
      })();
      const sourceATexture = (() : WebGLTexture => {
        if (transition.sourceA === null) {
          return sourceBTexture;
        }

        const sourceABinding = layerBindings.get(transition.sourceA);
        const sourceABaseTexture = resources.resourcePool.getExternalTexture(transition.sourceA);

        if (
          sourceABaseTexture === null ||
          (sourceABinding !== undefined && !sourceABinding.sourceReady)
        ) {
          return sourceBTexture;
        }

        return sourceABinding === undefined
          ? sourceABaseTexture
          : this.clipEffectProcessor.processTexture(
              context,
              resources,
              sourceABaseTexture,
              sourceABinding.effects,
              'clipEffectA',
              frameState.performance.bypassHeavyPreviewPasses,
            );
      })();
      const effectiveTransform = resolveEffectiveLayerTransform(
        transitionLayer.transform,
        transitionLayer.effects,
      );

      context.activeTexture(context.TEXTURE0);
      context.bindTexture(context.TEXTURE_2D, sourceATexture);
      context.activeTexture(context.TEXTURE1);
      context.bindTexture(context.TEXTURE_2D, sourceBTexture);
      context.uniform1f(passResources.mixProgressUniform, transition.progress);
      context.uniform1f(passResources.opacityUniform, transitionLayer.opacity);
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
      context.uniform1i(
        passResources.transitionTypeUniform,
        getTransitionTypeValue(transition),
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
