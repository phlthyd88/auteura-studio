import type { PictureInPictureConfig } from '../../types/compositor';
import type { RenderFrameState } from '../../types/render';
import type { RenderGraphPass, RenderGraphResources } from '../RenderGraph';

interface PictureInPicturePassResources {
  readonly anchorUniform: WebGLUniformLocation;
  readonly baseTextureUniform: WebGLUniformLocation;
  readonly insetUniform: WebGLUniformLocation;
  readonly opacityUniform: WebGLUniformLocation;
  readonly overlayTextureUniform: WebGLUniformLocation;
  readonly positionBuffer: WebGLBuffer;
  readonly positionLocation: number;
  readonly program: WebGLProgram;
  readonly showBorderUniform: WebGLUniformLocation;
  readonly sizeUniform: WebGLUniformLocation;
  readonly textureCoordBuffer: WebGLBuffer;
  readonly textureCoordLocation: number;
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
  uniform sampler2D uBaseTexture;
  uniform sampler2D uOverlayTexture;
  uniform vec2 uAnchor;
  uniform float uInset;
  uniform float uOpacity;
  uniform float uSize;
  uniform int uShowBorder;

  bool isInsideRect(vec2 coord, vec2 origin, vec2 size) {
    return coord.x >= origin.x &&
      coord.x <= origin.x + size.x &&
      coord.y >= origin.y &&
      coord.y <= origin.y + size.y;
  }

  void main(void) {
    vec4 baseColor = texture2D(uBaseTexture, vTexCoord);
    vec2 pipSize = vec2(clamp(uSize, 0.12, 0.6), clamp(uSize, 0.12, 0.6) * 0.5625);
    vec2 inset = vec2(clamp(uInset, 0.0, 0.2));
    vec2 pipOrigin = vec2(
      uAnchor.x < 0.5 ? inset.x : 1.0 - pipSize.x - inset.x,
      uAnchor.y < 0.5 ? inset.y : 1.0 - pipSize.y - inset.y
    );

    if (!isInsideRect(vTexCoord, pipOrigin, pipSize) || uOpacity <= 0.0) {
      gl_FragColor = baseColor;
      return;
    }

    vec2 localCoord = (vTexCoord - pipOrigin) / pipSize;
    vec4 overlayColor = texture2D(uOverlayTexture, localCoord);
    float borderMask =
      step(localCoord.x, 0.03) +
      step(localCoord.y, 0.03) +
      step(0.97, localCoord.x) +
      step(0.97, localCoord.y);

    if (uShowBorder == 1 && borderMask > 0.0) {
      gl_FragColor = vec4(0.96, 0.62, 0.04, 1.0);
      return;
    }

    gl_FragColor = mix(baseColor, overlayColor, clamp(uOpacity, 0.0, 1.0));
  }
`;

function createShader(
  context: WebGLRenderingContext,
  shaderType: number,
  source: string,
): WebGLShader {
  const shader = context.createShader(shaderType);

  if (shader === null) {
    throw new Error('Failed to create a PiP shader.');
  }

  context.shaderSource(shader, source);
  context.compileShader(shader);

  if (context.getShaderParameter(shader, context.COMPILE_STATUS) !== true) {
    const message = context.getShaderInfoLog(shader) ?? 'Unknown PiP shader error.';
    context.deleteShader(shader);
    throw new Error(message);
  }

  return shader;
}

function resolveAnchor(config: PictureInPictureConfig): readonly [number, number] {
  if (config.anchor === 'top-left') {
    return [0, 1];
  }

  if (config.anchor === 'top-right') {
    return [1, 1];
  }

  if (config.anchor === 'bottom-left') {
    return [0, 0];
  }

  return [1, 0];
}

function getSecondaryTexture(
  resources: RenderGraphResources,
  source: PictureInPictureConfig['source'],
): WebGLTexture {
  if (source === 'processed-output') {
    return resources.resourcePool.getTexture('processed');
  }

  return resources.resourcePool.getTexture('original');
}

export class PictureInPicturePass implements RenderGraphPass {
  private resources: PictureInPicturePassResources | null = null;

  initialize(context: WebGLRenderingContext, graphResources: RenderGraphResources): void {
    if (this.resources !== null) {
      this.dispose(context, graphResources);
    }

    const vertexShader = createShader(context, context.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(context, context.FRAGMENT_SHADER, fragmentShaderSource);
    const program = context.createProgram();

    if (program === null) {
      context.deleteShader(vertexShader);
      context.deleteShader(fragmentShader);
      throw new Error('Failed to create a PiP pass program.');
    }

    context.attachShader(program, vertexShader);
    context.attachShader(program, fragmentShader);
    context.linkProgram(program);
    context.deleteShader(vertexShader);
    context.deleteShader(fragmentShader);

    if (context.getProgramParameter(program, context.LINK_STATUS) !== true) {
      const message = context.getProgramInfoLog(program) ?? 'Unknown PiP link error.';
      context.deleteProgram(program);
      throw new Error(message);
    }

    const positionBuffer = context.createBuffer();
    const textureCoordBuffer = context.createBuffer();
    const positionLocation = context.getAttribLocation(program, 'aPosition');
    const textureCoordLocation = context.getAttribLocation(program, 'aTexCoord');
    const baseTextureUniform = context.getUniformLocation(program, 'uBaseTexture');
    const overlayTextureUniform = context.getUniformLocation(program, 'uOverlayTexture');
    const anchorUniform = context.getUniformLocation(program, 'uAnchor');
    const insetUniform = context.getUniformLocation(program, 'uInset');
    const opacityUniform = context.getUniformLocation(program, 'uOpacity');
    const sizeUniform = context.getUniformLocation(program, 'uSize');
    const showBorderUniform = context.getUniformLocation(program, 'uShowBorder');

    if (
      positionBuffer === null ||
      textureCoordBuffer === null ||
      positionLocation === -1 ||
      textureCoordLocation === -1 ||
      baseTextureUniform === null ||
      overlayTextureUniform === null ||
      anchorUniform === null ||
      insetUniform === null ||
      opacityUniform === null ||
      sizeUniform === null ||
      showBorderUniform === null
    ) {
      if (positionBuffer !== null) {
        context.deleteBuffer(positionBuffer);
      }

      if (textureCoordBuffer !== null) {
        context.deleteBuffer(textureCoordBuffer);
      }

      context.deleteProgram(program);
      throw new Error('Failed to initialize PiP pass attributes or uniforms.');
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
    context.uniform1i(baseTextureUniform, 0);
    context.uniform1i(overlayTextureUniform, 1);

    this.resources = {
      anchorUniform,
      baseTextureUniform,
      insetUniform,
      opacityUniform,
      overlayTextureUniform,
      positionBuffer,
      positionLocation,
      program,
      showBorderUniform,
      sizeUniform,
      textureCoordBuffer,
      textureCoordLocation,
    };
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
      throw new Error('PictureInPicturePass render invoked before initialization.');
    }

    if (!frameState.pictureInPicture.enabled) {
      context.bindFramebuffer(context.FRAMEBUFFER, null);
      context.viewport(0, 0, resources.canvasWidth, resources.canvasHeight);
      context.clear(context.COLOR_BUFFER_BIT);
      context.useProgram(this.resources.program);
      context.bindBuffer(context.ARRAY_BUFFER, this.resources.positionBuffer);
      context.enableVertexAttribArray(this.resources.positionLocation);
      context.vertexAttribPointer(this.resources.positionLocation, 2, context.FLOAT, false, 0, 0);
      context.bindBuffer(context.ARRAY_BUFFER, this.resources.textureCoordBuffer);
      context.enableVertexAttribArray(this.resources.textureCoordLocation);
      context.vertexAttribPointer(this.resources.textureCoordLocation, 2, context.FLOAT, false, 0, 0);
      context.activeTexture(context.TEXTURE0);
      context.bindTexture(context.TEXTURE_2D, resources.resourcePool.getTexture('composited'));
      context.activeTexture(context.TEXTURE1);
      context.bindTexture(
        context.TEXTURE_2D,
        getSecondaryTexture(resources, frameState.pictureInPicture.source),
      );
      context.uniform2f(this.resources.anchorUniform, 1, 0);
      context.uniform1f(this.resources.insetUniform, 0);
      context.uniform1f(this.resources.opacityUniform, 0);
      context.uniform1f(this.resources.sizeUniform, 0.2);
      context.uniform1i(this.resources.showBorderUniform, 0);
      context.drawArrays(context.TRIANGLE_STRIP, 0, 4);
      return;
    }

    const anchor = resolveAnchor(frameState.pictureInPicture);

    context.bindFramebuffer(context.FRAMEBUFFER, null);
    context.viewport(0, 0, resources.canvasWidth, resources.canvasHeight);
    context.clear(context.COLOR_BUFFER_BIT);
    context.useProgram(this.resources.program);

    context.bindBuffer(context.ARRAY_BUFFER, this.resources.positionBuffer);
    context.enableVertexAttribArray(this.resources.positionLocation);
    context.vertexAttribPointer(this.resources.positionLocation, 2, context.FLOAT, false, 0, 0);
    context.bindBuffer(context.ARRAY_BUFFER, this.resources.textureCoordBuffer);
    context.enableVertexAttribArray(this.resources.textureCoordLocation);
    context.vertexAttribPointer(this.resources.textureCoordLocation, 2, context.FLOAT, false, 0, 0);

    context.activeTexture(context.TEXTURE0);
    context.bindTexture(context.TEXTURE_2D, resources.resourcePool.getTexture('composited'));
    context.activeTexture(context.TEXTURE1);
    context.bindTexture(
      context.TEXTURE_2D,
      getSecondaryTexture(resources, frameState.pictureInPicture.source),
    );
    context.uniform2f(this.resources.anchorUniform, anchor[0], anchor[1]);
    context.uniform1f(this.resources.insetUniform, frameState.pictureInPicture.inset);
    context.uniform1f(this.resources.opacityUniform, frameState.pictureInPicture.opacity);
    context.uniform1f(this.resources.sizeUniform, frameState.pictureInPicture.size);
    context.uniform1i(
      this.resources.showBorderUniform,
      frameState.pictureInPicture.enabled && frameState.pictureInPicture.showBorder ? 1 : 0,
    );

    context.drawArrays(context.TRIANGLE_STRIP, 0, 4);
  }

  dispose(context: WebGLRenderingContext, _graphResources: RenderGraphResources): void {
    if (this.resources === null) {
      return;
    }

    context.deleteBuffer(this.resources.positionBuffer);
    context.deleteBuffer(this.resources.textureCoordBuffer);
    context.deleteProgram(this.resources.program);
    this.resources = null;
  }
}
