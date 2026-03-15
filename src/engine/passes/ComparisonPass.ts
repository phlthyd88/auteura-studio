import type { RenderComparisonConfig, RenderFrameState } from '../../types/render';
import type { RenderGraphPass, RenderGraphResources } from '../RenderGraph';

interface ComparisonPassResources {
  readonly originalTextureUniform: WebGLUniformLocation;
  readonly positionBuffer: WebGLBuffer;
  readonly positionLocation: number;
  readonly processedTextureUniform: WebGLUniformLocation;
  readonly program: WebGLProgram;
  readonly comparisonModeUniform: WebGLUniformLocation;
  readonly splitDirectionUniform: WebGLUniformLocation;
  readonly splitPositionUniform: WebGLUniformLocation;
  readonly textureCoordBuffer: WebGLBuffer;
  readonly textureCoordLocation: number;
  readonly rotationUniform: WebGLUniformLocation;
  readonly panUniform: WebGLUniformLocation;
  readonly zoomUniform: WebGLUniformLocation;
  readonly flipUniform: WebGLUniformLocation;
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
  uniform sampler2D uOriginalTexture;
  uniform sampler2D uProcessedTexture;
  uniform int uComparisonMode;
  uniform int uSplitDirection;
  uniform float uSplitPosition;
  uniform float uZoom;
  uniform vec2 uPan;
  uniform float uRotation;
  uniform vec2 uFlip;

  vec2 getOriginalSampleCoord() {
    vec2 centeredCoord = vTexCoord - 0.5 - uPan;
    centeredCoord /= max(uZoom, 0.001);
    centeredCoord *= uFlip;

    float rotation = radians(uRotation);
    mat2 rotationMatrix = mat2(cos(rotation), -sin(rotation), sin(rotation), cos(rotation));
    return rotationMatrix * centeredCoord + 0.5;
  }

  vec4 sampleOriginal() {
    vec2 sampleCoord = getOriginalSampleCoord();

    if (sampleCoord.x < 0.0 || sampleCoord.x > 1.0 || sampleCoord.y < 0.0 || sampleCoord.y > 1.0) {
      return vec4(0.0, 0.0, 0.0, 1.0);
    }

    return texture2D(uOriginalTexture, sampleCoord);
  }

  void main(void) {
    vec4 processedColor = texture2D(uProcessedTexture, vTexCoord);
    vec4 originalColor = sampleOriginal();

    if (uComparisonMode == 0) {
      gl_FragColor = processedColor;
      return;
    }

    if (uComparisonMode == 1) {
      gl_FragColor = originalColor;
      return;
    }

    float axisProgress = uSplitDirection == 0 ? vTexCoord.x : vTexCoord.y;
    float lineDistance = abs(axisProgress - uSplitPosition);

    if (uComparisonMode == 2) {
      if (lineDistance < 0.003) {
        gl_FragColor = vec4(0.96, 0.62, 0.04, 1.0);
        return;
      }

      gl_FragColor = axisProgress < uSplitPosition ? processedColor : originalColor;
      return;
    }

    float feather = smoothstep(uSplitPosition - 0.02, uSplitPosition + 0.02, axisProgress);
    vec4 wipeColor = mix(processedColor, originalColor, feather);

    if (lineDistance < 0.003) {
      gl_FragColor = vec4(0.22, 0.74, 0.97, 1.0);
      return;
    }

    gl_FragColor = wipeColor;
  }
`;

function createShader(
  context: WebGLRenderingContext,
  shaderType: number,
  source: string,
): WebGLShader {
  const shader = context.createShader(shaderType);

  if (shader === null) {
    throw new Error('Failed to create a WebGL shader for the comparison pass.');
  }

  context.shaderSource(shader, source);
  context.compileShader(shader);

  if (context.getShaderParameter(shader, context.COMPILE_STATUS) !== true) {
    const message = context.getShaderInfoLog(shader) ?? 'Unknown comparison shader error.';
    context.deleteShader(shader);
    throw new Error(message);
  }

  return shader;
}

function getComparisonModeValue(config: RenderComparisonConfig): number {
  if (config.mode === 'bypass') {
    return 1;
  }

  if (config.mode === 'split') {
    return 2;
  }

  if (config.mode === 'wipe') {
    return 3;
  }

  return 0;
}

export class ComparisonPass implements RenderGraphPass {
  private resources: ComparisonPassResources | null = null;

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
      throw new Error('Failed to create a comparison pass program.');
    }

    context.attachShader(program, vertexShader);
    context.attachShader(program, fragmentShader);
    context.linkProgram(program);
    context.deleteShader(vertexShader);
    context.deleteShader(fragmentShader);

    if (context.getProgramParameter(program, context.LINK_STATUS) !== true) {
      const message = context.getProgramInfoLog(program) ?? 'Unknown comparison link error.';
      context.deleteProgram(program);
      throw new Error(message);
    }

    const positionBuffer = context.createBuffer();
    const textureCoordBuffer = context.createBuffer();
    const positionLocation = context.getAttribLocation(program, 'aPosition');
    const textureCoordLocation = context.getAttribLocation(program, 'aTexCoord');
    const originalTextureUniform = context.getUniformLocation(program, 'uOriginalTexture');
    const processedTextureUniform = context.getUniformLocation(program, 'uProcessedTexture');
    const comparisonModeUniform = context.getUniformLocation(program, 'uComparisonMode');
    const splitDirectionUniform = context.getUniformLocation(program, 'uSplitDirection');
    const splitPositionUniform = context.getUniformLocation(program, 'uSplitPosition');
    const zoomUniform = context.getUniformLocation(program, 'uZoom');
    const panUniform = context.getUniformLocation(program, 'uPan');
    const rotationUniform = context.getUniformLocation(program, 'uRotation');
    const flipUniform = context.getUniformLocation(program, 'uFlip');

    if (
      positionBuffer === null ||
      textureCoordBuffer === null ||
      positionLocation === -1 ||
      textureCoordLocation === -1 ||
      originalTextureUniform === null ||
      processedTextureUniform === null ||
      comparisonModeUniform === null ||
      splitDirectionUniform === null ||
      splitPositionUniform === null ||
      zoomUniform === null ||
      panUniform === null ||
      rotationUniform === null ||
      flipUniform === null
    ) {
      if (positionBuffer !== null) {
        context.deleteBuffer(positionBuffer);
      }

      if (textureCoordBuffer !== null) {
        context.deleteBuffer(textureCoordBuffer);
      }

      context.deleteProgram(program);
      throw new Error('Failed to initialize comparison pass attributes or uniforms.');
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
    context.uniform1i(originalTextureUniform, 0);
    context.uniform1i(processedTextureUniform, 1);

    this.resources = {
      comparisonModeUniform,
      flipUniform,
      originalTextureUniform,
      panUniform,
      positionBuffer,
      positionLocation,
      processedTextureUniform,
      program,
      rotationUniform,
      splitDirectionUniform,
      splitPositionUniform,
      textureCoordBuffer,
      textureCoordLocation,
      zoomUniform,
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
      throw new Error('ComparisonPass render invoked before initialization.');
    }

    context.bindFramebuffer(
      context.FRAMEBUFFER,
      resources.resourcePool.getFramebuffer('composited'),
    );
    context.viewport(0, 0, resources.internalWidth, resources.internalHeight);
    context.clear(context.COLOR_BUFFER_BIT);
    context.useProgram(this.resources.program);

    context.bindBuffer(context.ARRAY_BUFFER, this.resources.positionBuffer);
    context.enableVertexAttribArray(this.resources.positionLocation);
    context.vertexAttribPointer(this.resources.positionLocation, 2, context.FLOAT, false, 0, 0);

    context.bindBuffer(context.ARRAY_BUFFER, this.resources.textureCoordBuffer);
    context.enableVertexAttribArray(this.resources.textureCoordLocation);
    context.vertexAttribPointer(this.resources.textureCoordLocation, 2, context.FLOAT, false, 0, 0);

    context.activeTexture(context.TEXTURE0);
    context.bindTexture(
      context.TEXTURE_2D,
      resources.resourcePool.getTexture(
        frameState.composition === null ? 'original' : 'layerComposite',
      ),
    );
    context.activeTexture(context.TEXTURE1);
    context.bindTexture(
      context.TEXTURE_2D,
      resources.resourcePool.getTexture('processed'),
    );
    context.uniform1i(
      this.resources.comparisonModeUniform,
      getComparisonModeValue(frameState.comparison),
    );
    context.uniform1i(
      this.resources.splitDirectionUniform,
      frameState.comparison.splitDirection === 'vertical' ? 0 : 1,
    );
    context.uniform1f(this.resources.splitPositionUniform, frameState.comparison.splitPosition);
    context.uniform1f(this.resources.zoomUniform, frameState.transform.zoom);
    context.uniform2f(this.resources.panUniform, frameState.transform.panX, frameState.transform.panY);
    context.uniform1f(this.resources.rotationUniform, frameState.transform.rotationDeg);
    context.uniform2f(
      this.resources.flipUniform,
      frameState.transform.flipX ? -1 : 1,
      frameState.transform.flipY ? -1 : 1,
    );
    context.drawArrays(context.TRIANGLE_STRIP, 0, 4);
    context.bindFramebuffer(context.FRAMEBUFFER, null);
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
