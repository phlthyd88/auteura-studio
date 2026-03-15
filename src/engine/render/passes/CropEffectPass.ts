import type { TimelineClipCropEffect, TimelineClipEffect } from '../../../models/Timeline';
import type { ResourcePoolTextureName } from '../../ResourcePool';
import type { RenderGraphResources } from '../../RenderGraph';

interface CropEffectPassResources {
  readonly cropMaxUniform: WebGLUniformLocation;
  readonly cropMinUniform: WebGLUniformLocation;
  readonly positionBuffer: WebGLBuffer;
  readonly positionLocation: number;
  readonly program: WebGLProgram;
  readonly textureCoordBuffer: WebGLBuffer;
  readonly textureCoordLocation: number;
  readonly textureUniform: WebGLUniformLocation;
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
  uniform vec2 uCropMax;
  uniform vec2 uCropMin;
  uniform sampler2D uTexture;

  void main(void) {
    vec2 span = max(uCropMax - uCropMin, vec2(0.01, 0.01));
    vec2 sampleUv = uCropMin + (vTexCoord * span);
    gl_FragColor = texture2D(uTexture, sampleUv);
  }
`;

function clampUnit(value: number): number {
  return Math.max(0, Math.min(0.95, value));
}

function createShader(
  context: WebGLRenderingContext,
  shaderType: number,
  source: string,
): WebGLShader {
  const shader = context.createShader(shaderType);

  if (shader === null) {
    throw new Error('Failed to create a shader for crop processing.');
  }

  context.shaderSource(shader, source);
  context.compileShader(shader);

  if (context.getShaderParameter(shader, context.COMPILE_STATUS) !== true) {
    const message = context.getShaderInfoLog(shader) ?? 'Unknown crop effect shader error.';
    context.deleteShader(shader);
    throw new Error(message);
  }

  return shader;
}

function createResources(context: WebGLRenderingContext): CropEffectPassResources {
  const vertexShader = createShader(context, context.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = createShader(context, context.FRAGMENT_SHADER, fragmentShaderSource);
  const program = context.createProgram();

  if (program === null) {
    context.deleteShader(vertexShader);
    context.deleteShader(fragmentShader);
    throw new Error('Failed to create a crop effect program.');
  }

  context.attachShader(program, vertexShader);
  context.attachShader(program, fragmentShader);
  context.linkProgram(program);
  context.deleteShader(vertexShader);
  context.deleteShader(fragmentShader);

  if (context.getProgramParameter(program, context.LINK_STATUS) !== true) {
    const message = context.getProgramInfoLog(program) ?? 'Unknown crop effect link error.';
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

  if (
    positionBuffer === null ||
    textureCoordBuffer === null ||
    positionLocation === -1 ||
    textureCoordLocation === -1 ||
    textureUniform === null ||
    cropMinUniform === null ||
    cropMaxUniform === null
  ) {
    if (positionBuffer !== null) {
      context.deleteBuffer(positionBuffer);
    }

    if (textureCoordBuffer !== null) {
      context.deleteBuffer(textureCoordBuffer);
    }

    context.deleteProgram(program);
    throw new Error('Failed to initialize crop effect attributes or uniforms.');
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
    cropMaxUniform,
    cropMinUniform,
    positionBuffer,
    positionLocation,
    program,
    textureCoordBuffer,
    textureCoordLocation,
    textureUniform,
  };
}

function normalizeCropEffect(effect: TimelineClipCropEffect): {
  readonly maxX: number;
  readonly maxY: number;
  readonly minX: number;
  readonly minY: number;
} {
  const minX = clampUnit(effect.left);
  const minY = clampUnit(effect.top);
  const maxX = Math.max(minX + 0.01, Math.min(1, 1 - clampUnit(effect.right)));
  const maxY = Math.max(minY + 0.01, Math.min(1, 1 - clampUnit(effect.bottom)));

  return {
    maxX,
    maxY,
    minX,
    minY,
  };
}

export function findEnabledCropEffect(
  effects: readonly TimelineClipEffect[],
): TimelineClipCropEffect | null {
  for (const effect of effects) {
    if (effect.type === 'crop' && effect.enabled) {
      return effect;
    }
  }

  return null;
}

export class CropEffectPass {
  private resources: CropEffectPassResources | null = null;

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

  renderToTarget(
    context: WebGLRenderingContext,
    graphResources: RenderGraphResources,
    sourceTexture: WebGLTexture,
    effect: TimelineClipCropEffect,
    targetName: Extract<ResourcePoolTextureName, 'clipEffectA' | 'clipEffectB'>,
  ): WebGLTexture {
    if (this.resources === null) {
      throw new Error('CropEffectPass render invoked before initialization.');
    }

    const passResources = this.resources;
    const cropBounds = normalizeCropEffect(effect);

    context.bindFramebuffer(
      context.FRAMEBUFFER,
      graphResources.resourcePool.getFramebuffer(targetName),
    );
    context.viewport(0, 0, graphResources.internalWidth, graphResources.internalHeight);
    context.clearColor(0, 0, 0, 0);
    context.clear(context.COLOR_BUFFER_BIT);
    context.disable(context.BLEND);
    context.useProgram(passResources.program);

    context.bindBuffer(context.ARRAY_BUFFER, passResources.positionBuffer);
    context.enableVertexAttribArray(passResources.positionLocation);
    context.vertexAttribPointer(passResources.positionLocation, 2, context.FLOAT, false, 0, 0);

    context.bindBuffer(context.ARRAY_BUFFER, passResources.textureCoordBuffer);
    context.enableVertexAttribArray(passResources.textureCoordLocation);
    context.vertexAttribPointer(passResources.textureCoordLocation, 2, context.FLOAT, false, 0, 0);

    context.activeTexture(context.TEXTURE0);
    context.bindTexture(context.TEXTURE_2D, sourceTexture);
    context.uniform2f(passResources.cropMinUniform, cropBounds.minX, cropBounds.minY);
    context.uniform2f(passResources.cropMaxUniform, cropBounds.maxX, cropBounds.maxY);
    context.drawArrays(context.TRIANGLE_STRIP, 0, 4);

    context.bindFramebuffer(context.FRAMEBUFFER, null);

    return graphResources.resourcePool.getTexture(targetName);
  }
}
