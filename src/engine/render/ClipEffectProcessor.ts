import type {
  TimelineClipCropEffect,
  TimelineClipEffect,
  TimelineClipTransform,
  TimelineClipTransformOverrideEffect,
  TimelineClipVignetteEffect,
} from '../../models/Timeline';
import type { ResourcePoolTextureName } from '../ResourcePool';
import type { RenderGraphResources } from '../RenderGraph';

interface ClipEffectProcessorResources {
  readonly blurAmountUniform: WebGLUniformLocation;
  readonly cropMaxUniform: WebGLUniformLocation;
  readonly cropMinUniform: WebGLUniformLocation;
  readonly positionBuffer: WebGLBuffer;
  readonly positionLocation: number;
  readonly program: WebGLProgram;
  readonly sharpenAmountUniform: WebGLUniformLocation;
  readonly textureCoordBuffer: WebGLBuffer;
  readonly textureCoordLocation: number;
  readonly textureUniform: WebGLUniformLocation;
  readonly texelSizeUniform: WebGLUniformLocation;
  readonly vignetteFeatherUniform: WebGLUniformLocation;
  readonly vignetteIntensityUniform: WebGLUniformLocation;
  readonly vignetteRoundnessUniform: WebGLUniformLocation;
}

export interface ClipEffectSettings {
  readonly blurAmount: number;
  readonly crop: TimelineClipCropEffect | null;
  readonly sharpenAmount: number;
  readonly transformOverride: TimelineClipTransformOverrideEffect | null;
  readonly vignette: TimelineClipVignetteEffect | null;
}

const vertexShaderSource = `
  attribute vec2 aPosition;
  attribute vec2 aTexCoord;
  varying vec2 vTexCoord;

  void main(void) {
    gl_Position = vec4(aPosition, 0.0, 1.0);
    vTexCoord = aTexCoord;
  }
`;

const fragmentShaderSource = `
  precision mediump float;

  varying vec2 vTexCoord;
  uniform sampler2D uTexture;
  uniform vec2 uCropMin;
  uniform vec2 uCropMax;
  uniform vec2 uTexelSize;
  uniform float uBlurAmount;
  uniform float uSharpenAmount;
  uniform float uVignetteIntensity;
  uniform float uVignetteFeather;
  uniform float uVignetteRoundness;

  vec4 sampleSource(vec2 uv) {
    return texture2D(uTexture, clamp(uv, 0.0, 1.0));
  }

  void main(void) {
    vec2 span = max(uCropMax - uCropMin, vec2(0.01, 0.01));
    vec2 sampleUv = uCropMin + (vTexCoord * span);
    vec4 baseColor = sampleSource(sampleUv);

    vec2 blurOffset = uTexelSize * max(0.0, uBlurAmount) * 2.0;
    vec4 blurredColor = baseColor * 0.28;
    blurredColor += sampleSource(sampleUv + vec2(blurOffset.x, 0.0)) * 0.18;
    blurredColor += sampleSource(sampleUv - vec2(blurOffset.x, 0.0)) * 0.18;
    blurredColor += sampleSource(sampleUv + vec2(0.0, blurOffset.y)) * 0.18;
    blurredColor += sampleSource(sampleUv - vec2(0.0, blurOffset.y)) * 0.18;

    vec4 processedColor = mix(baseColor, blurredColor, clamp(uBlurAmount, 0.0, 1.0));
    vec3 sharpenedColor = processedColor.rgb + ((processedColor.rgb - blurredColor.rgb) * max(0.0, uSharpenAmount));
    processedColor.rgb = clamp(sharpenedColor, 0.0, 1.0);

    if (uVignetteIntensity > 0.0) {
      vec2 centered = (vTexCoord - 0.5) * vec2(max(0.2, uVignetteRoundness), 1.0);
      float vignetteDistance = length(centered);
      float vignetteMask = smoothstep(
        max(0.01, 1.0 - max(0.01, uVignetteFeather)),
        1.0,
        vignetteDistance * 1.4142
      );
      processedColor.rgb *= 1.0 - (vignetteMask * clamp(uVignetteIntensity, 0.0, 1.0));
    }

    gl_FragColor = vec4(processedColor.rgb, baseColor.a);
  }
`;

function createShader(
  context: WebGLRenderingContext,
  shaderType: number,
  source: string,
): WebGLShader {
  const shader = context.createShader(shaderType);

  if (shader === null) {
    throw new Error('Failed to create a shader for clip effect processing.');
  }

  context.shaderSource(shader, source);
  context.compileShader(shader);

  if (context.getShaderParameter(shader, context.COMPILE_STATUS) !== true) {
    const message = context.getShaderInfoLog(shader) ?? 'Unknown clip effect shader error.';
    context.deleteShader(shader);
    throw new Error(message);
  }

  return shader;
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(0.95, value));
}

function normalizeCropBounds(crop: TimelineClipCropEffect | null): {
  readonly maxX: number;
  readonly maxY: number;
  readonly minX: number;
  readonly minY: number;
} {
  if (crop === null) {
    return {
      maxX: 1,
      maxY: 1,
      minX: 0,
      minY: 0,
    };
  }

  const minX = clampUnit(crop.left);
  const minY = clampUnit(crop.top);
  const maxX = Math.max(minX + 0.01, Math.min(1, 1 - clampUnit(crop.right)));
  const maxY = Math.max(minY + 0.01, Math.min(1, 1 - clampUnit(crop.bottom)));

  return {
    maxX,
    maxY,
    minX,
    minY,
  };
}

function hasVisualProcessing(settings: ClipEffectSettings): boolean {
  return (
    settings.crop !== null ||
    settings.blurAmount > 0 ||
    settings.sharpenAmount > 0 ||
    settings.vignette !== null
  );
}

function createResources(context: WebGLRenderingContext): ClipEffectProcessorResources {
  const vertexShader = createShader(context, context.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = createShader(context, context.FRAGMENT_SHADER, fragmentShaderSource);
  const program = context.createProgram();

  if (program === null) {
    context.deleteShader(vertexShader);
    context.deleteShader(fragmentShader);
    throw new Error('Failed to create a clip effect processing program.');
  }

  context.attachShader(program, vertexShader);
  context.attachShader(program, fragmentShader);
  context.linkProgram(program);
  context.deleteShader(vertexShader);
  context.deleteShader(fragmentShader);

  if (context.getProgramParameter(program, context.LINK_STATUS) !== true) {
    const message = context.getProgramInfoLog(program) ?? 'Unknown clip effect link error.';
    context.deleteProgram(program);
    throw new Error(message);
  }

  const positionBuffer = context.createBuffer();
  const textureCoordBuffer = context.createBuffer();
  const positionLocation = context.getAttribLocation(program, 'aPosition');
  const textureCoordLocation = context.getAttribLocation(program, 'aTexCoord');
  const textureUniform = context.getUniformLocation(program, 'uTexture');
  const cropMinUniform = context.getUniformLocation(program, 'uCropMin');
  const cropMaxUniform = context.getUniformLocation(program, 'uCropMax');
  const texelSizeUniform = context.getUniformLocation(program, 'uTexelSize');
  const blurAmountUniform = context.getUniformLocation(program, 'uBlurAmount');
  const sharpenAmountUniform = context.getUniformLocation(program, 'uSharpenAmount');
  const vignetteIntensityUniform = context.getUniformLocation(program, 'uVignetteIntensity');
  const vignetteFeatherUniform = context.getUniformLocation(program, 'uVignetteFeather');
  const vignetteRoundnessUniform = context.getUniformLocation(program, 'uVignetteRoundness');

  if (
    positionBuffer === null ||
    textureCoordBuffer === null ||
    positionLocation === -1 ||
    textureCoordLocation === -1 ||
    textureUniform === null ||
    cropMinUniform === null ||
    cropMaxUniform === null ||
    texelSizeUniform === null ||
    blurAmountUniform === null ||
    sharpenAmountUniform === null ||
    vignetteIntensityUniform === null ||
    vignetteFeatherUniform === null ||
    vignetteRoundnessUniform === null
  ) {
    if (positionBuffer !== null) {
      context.deleteBuffer(positionBuffer);
    }

    if (textureCoordBuffer !== null) {
      context.deleteBuffer(textureCoordBuffer);
    }

    context.deleteProgram(program);
    throw new Error('Failed to initialize clip effect attributes or uniforms.');
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
    blurAmountUniform,
    cropMaxUniform,
    cropMinUniform,
    positionBuffer,
    positionLocation,
    program,
    sharpenAmountUniform,
    textureCoordBuffer,
    textureCoordLocation,
    textureUniform,
    texelSizeUniform,
    vignetteFeatherUniform,
    vignetteIntensityUniform,
    vignetteRoundnessUniform,
  };
}

export function resolveClipEffectSettings(
  effects: readonly TimelineClipEffect[],
): ClipEffectSettings {
  let crop: TimelineClipCropEffect | null = null;
  let transformOverride: TimelineClipTransformOverrideEffect | null = null;
  let vignette: TimelineClipVignetteEffect | null = null;
  let blurAmount = 0;
  let sharpenAmount = 0;

  effects.forEach((effect: TimelineClipEffect): void => {
    if (!effect.enabled) {
      return;
    }

    switch (effect.type) {
      case 'blur':
        blurAmount = Math.max(blurAmount, Math.min(1, effect.radius));
        break;
      case 'crop':
        crop = effect;
        break;
      case 'sharpen':
        sharpenAmount = Math.max(sharpenAmount, Math.min(1, effect.amount));
        break;
      case 'transform-override':
        transformOverride = effect;
        break;
      case 'vignette':
        vignette = effect;
        break;
      default:
        break;
    }
  });

  return {
    blurAmount,
    crop,
    sharpenAmount,
    transformOverride,
    vignette,
  };
}

export function resolveEffectiveLayerTransform(
  baseTransform: TimelineClipTransform,
  effects: readonly TimelineClipEffect[],
): TimelineClipTransform {
  const transformOverride = resolveClipEffectSettings(effects).transformOverride;
  return transformOverride?.transform ?? baseTransform;
}

export class ClipEffectProcessor {
  private resources: ClipEffectProcessorResources | null = null;

  dispose(context: WebGLRenderingContext): void {
    if (this.resources === null) {
      return;
    }

    context.deleteBuffer(this.resources.positionBuffer);
    context.deleteBuffer(this.resources.textureCoordBuffer);
    context.deleteProgram(this.resources.program);
    this.resources = null;
  }

  initialize(context: WebGLRenderingContext): void {
    if (this.resources !== null) {
      this.dispose(context);
    }

    this.resources = createResources(context);
  }

  processTexture(
    context: WebGLRenderingContext,
    graphResources: RenderGraphResources,
    sourceTexture: WebGLTexture,
    effects: readonly TimelineClipEffect[],
    targetName: Extract<ResourcePoolTextureName, 'clipEffectA' | 'clipEffectB'>,
    bypassHeavyPreviewEffects: boolean,
  ): WebGLTexture {
    if (this.resources === null) {
      throw new Error('ClipEffectProcessor invoked before initialization.');
    }

    const settings = resolveClipEffectSettings(effects);
    const effectiveSettings: ClipEffectSettings =
      bypassHeavyPreviewEffects
        ? {
            ...settings,
            blurAmount: 0,
            sharpenAmount: 0,
          }
        : settings;

    if (!hasVisualProcessing(effectiveSettings)) {
      return sourceTexture;
    }

    const cropBounds = normalizeCropBounds(effectiveSettings.crop);
    const vignette = effectiveSettings.vignette;

    context.bindFramebuffer(
      context.FRAMEBUFFER,
      graphResources.resourcePool.getFramebuffer(targetName),
    );
    context.viewport(0, 0, graphResources.internalWidth, graphResources.internalHeight);
    context.clearColor(0, 0, 0, 0);
    context.clear(context.COLOR_BUFFER_BIT);
    context.disable(context.BLEND);
    context.useProgram(this.resources.program);

    context.bindBuffer(context.ARRAY_BUFFER, this.resources.positionBuffer);
    context.enableVertexAttribArray(this.resources.positionLocation);
    context.vertexAttribPointer(this.resources.positionLocation, 2, context.FLOAT, false, 0, 0);

    context.bindBuffer(context.ARRAY_BUFFER, this.resources.textureCoordBuffer);
    context.enableVertexAttribArray(this.resources.textureCoordLocation);
    context.vertexAttribPointer(this.resources.textureCoordLocation, 2, context.FLOAT, false, 0, 0);

    context.activeTexture(context.TEXTURE0);
    context.bindTexture(context.TEXTURE_2D, sourceTexture);
    context.uniform2f(this.resources.cropMinUniform, cropBounds.minX, cropBounds.minY);
    context.uniform2f(this.resources.cropMaxUniform, cropBounds.maxX, cropBounds.maxY);
    context.uniform2f(
      this.resources.texelSizeUniform,
      1 / Math.max(1, graphResources.internalWidth),
      1 / Math.max(1, graphResources.internalHeight),
    );
    context.uniform1f(this.resources.blurAmountUniform, effectiveSettings.blurAmount);
    context.uniform1f(this.resources.sharpenAmountUniform, effectiveSettings.sharpenAmount);
    context.uniform1f(this.resources.vignetteIntensityUniform, vignette?.intensity ?? 0);
    context.uniform1f(this.resources.vignetteFeatherUniform, vignette?.feather ?? 0.5);
    context.uniform1f(this.resources.vignetteRoundnessUniform, vignette?.roundness ?? 1);
    context.drawArrays(context.TRIANGLE_STRIP, 0, 4);

    context.bindFramebuffer(context.FRAMEBUFFER, null);

    return graphResources.resourcePool.getTexture(targetName);
  }
}
