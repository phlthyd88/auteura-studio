import type { RenderFrameState } from '../../types/render';
import type { RenderGraphPass, RenderGraphResources } from '../RenderGraph';

interface MaskRefinementPassResources {
  readonly edgeSoftnessUniform: WebGLUniformLocation;
  readonly hasMaskUniform: WebGLUniformLocation;
  readonly enabledUniform: WebGLUniformLocation;
  readonly positionBuffer: WebGLBuffer;
  readonly positionLocation: number;
  readonly program: WebGLProgram;
  readonly rawMaskSizeUniform: WebGLUniformLocation;
  readonly rawMaskTexture: WebGLTexture;
  readonly rawMaskTextureUniform: WebGLUniformLocation;
  readonly textureCoordBuffer: WebGLBuffer;
  readonly textureCoordLocation: number;
  readonly thresholdUniform: WebGLUniformLocation;
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
  uniform sampler2D uRawMaskTexture;
  uniform vec2 uRawMaskSize;
  uniform float uThreshold;
  uniform float uEdgeSoftness;
  uniform int uHasMask;
  uniform int uEnabled;

  float readMask(vec2 coord) {
    float sampleValue = texture2D(uRawMaskTexture, coord).r;
    return sampleValue > 0.5 ? sampleValue : clamp(sampleValue * 255.0, 0.0, 1.0);
  }

  void main(void) {
    if (uHasMask == 0) {
      gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
      return;
    }

    if (uEnabled == 0) {
      float rawMask = readMask(vTexCoord);
      gl_FragColor = vec4(vec3(rawMask), 1.0);
      return;
    }

    vec2 rawPixelSize = 1.0 / max(uRawMaskSize, vec2(1.0, 1.0));
    float accumulated =
      readMask(vTexCoord) * 0.35 +
      readMask(vTexCoord + vec2(rawPixelSize.x, 0.0)) * 0.15 +
      readMask(vTexCoord - vec2(rawPixelSize.x, 0.0)) * 0.15 +
      readMask(vTexCoord + vec2(0.0, rawPixelSize.y)) * 0.15 +
      readMask(vTexCoord - vec2(0.0, rawPixelSize.y)) * 0.15 +
      readMask(vTexCoord + rawPixelSize) * 0.025 +
      readMask(vTexCoord - rawPixelSize) * 0.025;

    float refinedMask = smoothstep(
      clamp(uThreshold - uEdgeSoftness, 0.0, 1.0),
      clamp(uThreshold + uEdgeSoftness, 0.0, 1.0),
      accumulated
    );

    gl_FragColor = vec4(vec3(refinedMask), 1.0);
  }
`;

function createShader(
  context: WebGLRenderingContext,
  shaderType: number,
  source: string,
): WebGLShader {
  const shader = context.createShader(shaderType);

  if (shader === null) {
    throw new Error('Failed to create a shader for mask refinement.');
  }

  context.shaderSource(shader, source);
  context.compileShader(shader);

  if (context.getShaderParameter(shader, context.COMPILE_STATUS) !== true) {
    const message = context.getShaderInfoLog(shader) ?? 'Unknown mask refinement shader error.';
    context.deleteShader(shader);
    throw new Error(message);
  }

  return shader;
}

function createResources(context: WebGLRenderingContext): MaskRefinementPassResources {
  const vertexShader = createShader(context, context.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = createShader(context, context.FRAGMENT_SHADER, fragmentShaderSource);
  const program = context.createProgram();

  if (program === null) {
    context.deleteShader(vertexShader);
    context.deleteShader(fragmentShader);
    throw new Error('Failed to create a mask refinement program.');
  }

  context.attachShader(program, vertexShader);
  context.attachShader(program, fragmentShader);
  context.linkProgram(program);
  context.deleteShader(vertexShader);
  context.deleteShader(fragmentShader);

  if (context.getProgramParameter(program, context.LINK_STATUS) !== true) {
    const message = context.getProgramInfoLog(program) ?? 'Unknown mask refinement link error.';
    context.deleteProgram(program);
    throw new Error(message);
  }

  const positionBuffer = context.createBuffer();
  const textureCoordBuffer = context.createBuffer();
  const rawMaskTexture = context.createTexture();
  const positionLocation = context.getAttribLocation(program, 'aPosition');
  const textureCoordLocation = context.getAttribLocation(program, 'aTexCoord');
  const rawMaskTextureUniform = context.getUniformLocation(program, 'uRawMaskTexture');
  const rawMaskSizeUniform = context.getUniformLocation(program, 'uRawMaskSize');
  const thresholdUniform = context.getUniformLocation(program, 'uThreshold');
  const edgeSoftnessUniform = context.getUniformLocation(program, 'uEdgeSoftness');
  const hasMaskUniform = context.getUniformLocation(program, 'uHasMask');
  const enabledUniform = context.getUniformLocation(program, 'uEnabled');

  if (
    positionBuffer === null ||
    textureCoordBuffer === null ||
    rawMaskTexture === null ||
    positionLocation === -1 ||
    textureCoordLocation === -1 ||
    rawMaskTextureUniform === null ||
    rawMaskSizeUniform === null ||
    thresholdUniform === null ||
    edgeSoftnessUniform === null ||
    hasMaskUniform === null ||
    enabledUniform === null
  ) {
    if (positionBuffer !== null) {
      context.deleteBuffer(positionBuffer);
    }

    if (textureCoordBuffer !== null) {
      context.deleteBuffer(textureCoordBuffer);
    }

    if (rawMaskTexture !== null) {
      context.deleteTexture(rawMaskTexture);
    }

    context.deleteProgram(program);
    throw new Error('Failed to initialize mask refinement attributes or uniforms.');
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

  context.bindTexture(context.TEXTURE_2D, rawMaskTexture);
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE);
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE);
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.LINEAR);
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.LINEAR);
  context.texImage2D(
    context.TEXTURE_2D,
    0,
    context.LUMINANCE,
    1,
    1,
    0,
    context.LUMINANCE,
    context.UNSIGNED_BYTE,
    new Uint8Array([255]),
  );

  context.useProgram(program);
  context.uniform1i(rawMaskTextureUniform, 0);

  return {
    edgeSoftnessUniform,
    enabledUniform,
    hasMaskUniform,
    positionBuffer,
    positionLocation,
    program,
    rawMaskSizeUniform,
    rawMaskTexture,
    rawMaskTextureUniform,
    textureCoordBuffer,
    textureCoordLocation,
    thresholdUniform,
  };
}

export class MaskRefinementPass implements RenderGraphPass {
  public readonly bypassInPreview = true;

  private resources: MaskRefinementPassResources | null = null;

  initialize(context: WebGLRenderingContext, graphResources: RenderGraphResources): void {
    if (this.resources !== null) {
      this.dispose(context, graphResources);
    }

    this.resources = createResources(context);
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
    graphResources: RenderGraphResources,
    frameState: RenderFrameState,
  ): void {
    if (this.resources === null) {
      throw new Error('MaskRefinementPass render invoked before initialization.');
    }

    context.bindFramebuffer(
      context.FRAMEBUFFER,
      graphResources.resourcePool.getFramebuffer('refinedMask'),
    );
    context.viewport(0, 0, graphResources.internalWidth, graphResources.internalHeight);
    context.clear(context.COLOR_BUFFER_BIT);
    context.useProgram(this.resources.program);

    context.bindBuffer(context.ARRAY_BUFFER, this.resources.positionBuffer);
    context.enableVertexAttribArray(this.resources.positionLocation);
    context.vertexAttribPointer(this.resources.positionLocation, 2, context.FLOAT, false, 0, 0);
    context.bindBuffer(context.ARRAY_BUFFER, this.resources.textureCoordBuffer);
    context.enableVertexAttribArray(this.resources.textureCoordLocation);
    context.vertexAttribPointer(this.resources.textureCoordLocation, 2, context.FLOAT, false, 0, 0);

    context.activeTexture(context.TEXTURE0);
    context.bindTexture(context.TEXTURE_2D, this.resources.rawMaskTexture);

    if (frameState.aiState.segmentationMask === null) {
      context.uniform1i(this.resources.hasMaskUniform, 0);
      context.uniform1i(this.resources.enabledUniform, 0);
      context.uniform2f(this.resources.rawMaskSizeUniform, 1, 1);
      context.uniform1f(this.resources.thresholdUniform, frameState.maskRefinement.threshold);
      context.uniform1f(this.resources.edgeSoftnessUniform, frameState.maskRefinement.edgeSoftness);
      context.drawArrays(context.TRIANGLE_STRIP, 0, 4);
      context.bindFramebuffer(context.FRAMEBUFFER, null);
      return;
    }

    context.texImage2D(
      context.TEXTURE_2D,
      0,
      context.LUMINANCE,
      frameState.aiState.segmentationMask.width,
      frameState.aiState.segmentationMask.height,
      0,
      context.LUMINANCE,
      context.UNSIGNED_BYTE,
      frameState.aiState.segmentationMask.data,
    );
    context.uniform1i(this.resources.hasMaskUniform, 1);
    context.uniform1i(this.resources.enabledUniform, frameState.maskRefinement.enabled ? 1 : 0);
    context.uniform2f(
      this.resources.rawMaskSizeUniform,
      frameState.aiState.segmentationMask.width,
      frameState.aiState.segmentationMask.height,
    );
    context.uniform1f(this.resources.thresholdUniform, frameState.maskRefinement.threshold);
    context.uniform1f(this.resources.edgeSoftnessUniform, frameState.maskRefinement.edgeSoftness);
    context.drawArrays(context.TRIANGLE_STRIP, 0, 4);
    context.bindFramebuffer(context.FRAMEBUFFER, null);
  }

  dispose(context: WebGLRenderingContext, _graphResources: RenderGraphResources): void {
    if (this.resources === null) {
      return;
    }

    context.deleteBuffer(this.resources.positionBuffer);
    context.deleteBuffer(this.resources.textureCoordBuffer);
    context.deleteTexture(this.resources.rawMaskTexture);
    context.deleteProgram(this.resources.program);
    this.resources = null;
  }
}
