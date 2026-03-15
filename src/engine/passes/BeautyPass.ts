import type { VisionFaceRegion } from '../../types/vision';
import type { RenderFrameState } from '../../types/render';
import type { RenderGraphPass, RenderGraphResources } from '../RenderGraph';

interface BeautyPassResources {
  readonly complexionBalancingUniform: WebGLUniformLocation;
  readonly detailPreservationUniform: WebGLUniformLocation;
  readonly faceBoundsUniform: WebGLUniformLocation;
  readonly foreheadBoundsUniform: WebGLUniformLocation;
  readonly hasFaceUniform: WebGLUniformLocation;
  readonly leftUnderEyeBoundsUniform: WebGLUniformLocation;
  readonly positionBuffer: WebGLBuffer;
  readonly positionLocation: number;
  readonly program: WebGLProgram;
  readonly rightUnderEyeBoundsUniform: WebGLUniformLocation;
  readonly skinSmoothingUniform: WebGLUniformLocation;
  readonly sourceTextureUniform: WebGLUniformLocation;
  readonly textureCoordBuffer: WebGLBuffer;
  readonly textureCoordLocation: number;
  readonly textureSizeUniform: WebGLUniformLocation;
  readonly underEyeSofteningUniform: WebGLUniformLocation;
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
  uniform sampler2D uSourceTexture;
  uniform vec2 uTextureSize;
  uniform vec4 uFaceBounds;
  uniform vec4 uForeheadBounds;
  uniform vec4 uLeftUnderEyeBounds;
  uniform vec4 uRightUnderEyeBounds;
  uniform float uSkinSmoothing;
  uniform float uDetailPreservation;
  uniform float uComplexionBalancing;
  uniform float uUnderEyeSoftening;
  uniform int uHasFace;

  float regionMask(vec4 bounds, vec2 coord, float feather) {
    float xMask = smoothstep(bounds.x - feather, bounds.x + feather, coord.x) *
      (1.0 - smoothstep(bounds.z - feather, bounds.z + feather, coord.x));
    float yMask = smoothstep(bounds.y - feather, bounds.y + feather, coord.y) *
      (1.0 - smoothstep(bounds.w - feather, bounds.w + feather, coord.y));
    return xMask * yMask;
  }

  vec3 sampleSoftBlur(vec2 coord, vec2 pixelSize) {
    vec3 color = texture2D(uSourceTexture, coord).rgb * 0.36;
    color += texture2D(uSourceTexture, coord + vec2(pixelSize.x, 0.0)).rgb * 0.16;
    color += texture2D(uSourceTexture, coord - vec2(pixelSize.x, 0.0)).rgb * 0.16;
    color += texture2D(uSourceTexture, coord + vec2(0.0, pixelSize.y)).rgb * 0.12;
    color += texture2D(uSourceTexture, coord - vec2(0.0, pixelSize.y)).rgb * 0.12;
    color += texture2D(uSourceTexture, coord + pixelSize).rgb * 0.04;
    color += texture2D(uSourceTexture, coord - pixelSize).rgb * 0.04;
    return color;
  }

  void main(void) {
    vec4 source = texture2D(uSourceTexture, vTexCoord);

    if (uHasFace == 0) {
      gl_FragColor = source;
      return;
    }

    vec2 pixelSize = 1.0 / max(uTextureSize, vec2(1.0, 1.0));
    vec3 blurred = sampleSoftBlur(vTexCoord, pixelSize * mix(0.75, 2.25, clamp(uSkinSmoothing, 0.0, 1.0)));
    vec3 highFrequency = source.rgb - blurred;
    float faceMask = regionMask(uFaceBounds, vTexCoord, 0.03);
    float foreheadMask = regionMask(uForeheadBounds, vTexCoord, 0.02);
    float leftUnderEyeMask = regionMask(uLeftUnderEyeBounds, vTexCoord, 0.018);
    float rightUnderEyeMask = regionMask(uRightUnderEyeBounds, vTexCoord, 0.018);
    float underEyeMask = max(leftUnderEyeMask, rightUnderEyeMask);
    float smoothingMask = max(faceMask * 0.82, foreheadMask * 0.9);
    float smoothingAmount = smoothingMask * clamp(uSkinSmoothing, 0.0, 1.0);
    vec3 smoothed = mix(source.rgb, blurred, smoothingAmount);
    vec3 detailRestored = smoothed + highFrequency * clamp(uDetailPreservation, 0.0, 1.0) * faceMask;
    float luminance = dot(detailRestored, vec3(0.299, 0.587, 0.114));
    vec3 complexionBalanced = mix(
      detailRestored,
      mix(detailRestored, vec3(luminance), 0.08),
      clamp(uComplexionBalancing, 0.0, 1.0) * faceMask
    );
    vec3 underEyeSoftened = mix(
      complexionBalanced,
      blurred,
      clamp(uUnderEyeSoftening, 0.0, 1.0) * underEyeMask
    );

    gl_FragColor = vec4(underEyeSoftened, source.a);
  }
`;

function createShader(
  context: WebGLRenderingContext,
  shaderType: number,
  source: string,
): WebGLShader {
  const shader = context.createShader(shaderType);

  if (shader === null) {
    throw new Error('Failed to create a shader for the beauty pass.');
  }

  context.shaderSource(shader, source);
  context.compileShader(shader);

  if (context.getShaderParameter(shader, context.COMPILE_STATUS) !== true) {
    const message = context.getShaderInfoLog(shader) ?? 'Unknown beauty shader compilation error.';
    context.deleteShader(shader);
    throw new Error(message);
  }

  return shader;
}

function createResources(context: WebGLRenderingContext): BeautyPassResources {
  const vertexShader = createShader(context, context.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = createShader(context, context.FRAGMENT_SHADER, fragmentShaderSource);
  const program = context.createProgram();

  if (program === null) {
    context.deleteShader(vertexShader);
    context.deleteShader(fragmentShader);
    throw new Error('Failed to create the beauty pass program.');
  }

  context.attachShader(program, vertexShader);
  context.attachShader(program, fragmentShader);
  context.linkProgram(program);
  context.deleteShader(vertexShader);
  context.deleteShader(fragmentShader);

  if (context.getProgramParameter(program, context.LINK_STATUS) !== true) {
    const message = context.getProgramInfoLog(program) ?? 'Unknown beauty pass link error.';
    context.deleteProgram(program);
    throw new Error(message);
  }

  const positionBuffer = context.createBuffer();
  const textureCoordBuffer = context.createBuffer();
  const positionLocation = context.getAttribLocation(program, 'aPosition');
  const textureCoordLocation = context.getAttribLocation(program, 'aTexCoord');
  const sourceTextureUniform = context.getUniformLocation(program, 'uSourceTexture');
  const textureSizeUniform = context.getUniformLocation(program, 'uTextureSize');
  const faceBoundsUniform = context.getUniformLocation(program, 'uFaceBounds');
  const foreheadBoundsUniform = context.getUniformLocation(program, 'uForeheadBounds');
  const leftUnderEyeBoundsUniform = context.getUniformLocation(program, 'uLeftUnderEyeBounds');
  const rightUnderEyeBoundsUniform = context.getUniformLocation(program, 'uRightUnderEyeBounds');
  const skinSmoothingUniform = context.getUniformLocation(program, 'uSkinSmoothing');
  const detailPreservationUniform = context.getUniformLocation(program, 'uDetailPreservation');
  const complexionBalancingUniform = context.getUniformLocation(program, 'uComplexionBalancing');
  const underEyeSofteningUniform = context.getUniformLocation(program, 'uUnderEyeSoftening');
  const hasFaceUniform = context.getUniformLocation(program, 'uHasFace');

  if (
    positionBuffer === null ||
    textureCoordBuffer === null ||
    positionLocation === -1 ||
    textureCoordLocation === -1 ||
    sourceTextureUniform === null ||
    textureSizeUniform === null ||
    faceBoundsUniform === null ||
    foreheadBoundsUniform === null ||
    leftUnderEyeBoundsUniform === null ||
    rightUnderEyeBoundsUniform === null ||
    skinSmoothingUniform === null ||
    detailPreservationUniform === null ||
    complexionBalancingUniform === null ||
    underEyeSofteningUniform === null ||
    hasFaceUniform === null
  ) {
    if (positionBuffer !== null) {
      context.deleteBuffer(positionBuffer);
    }

    if (textureCoordBuffer !== null) {
      context.deleteBuffer(textureCoordBuffer);
    }

    context.deleteProgram(program);
    throw new Error('Failed to initialize beauty pass uniforms or buffers.');
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
  context.uniform1i(sourceTextureUniform, 0);

  return {
    complexionBalancingUniform,
    detailPreservationUniform,
    faceBoundsUniform,
    foreheadBoundsUniform,
    hasFaceUniform,
    leftUnderEyeBoundsUniform,
    positionBuffer,
    positionLocation,
    program,
    rightUnderEyeBoundsUniform,
    skinSmoothingUniform,
    sourceTextureUniform,
    textureCoordBuffer,
    textureCoordLocation,
    textureSizeUniform,
    underEyeSofteningUniform,
  };
}

function findRegion(
  regions: readonly VisionFaceRegion[],
  kind: VisionFaceRegion['kind'],
): VisionFaceRegion | null {
  return regions.find((region: VisionFaceRegion): boolean => region.kind === kind) ?? null;
}

function bindRegionUniform(
  context: WebGLRenderingContext,
  uniform: WebGLUniformLocation,
  region: VisionFaceRegion | null,
): void {
  if (region === null) {
    context.uniform4f(uniform, 0, 0, 0, 0);
    return;
  }

  context.uniform4f(
    uniform,
    region.bounds.minX,
    region.bounds.minY,
    region.bounds.maxX,
    region.bounds.maxY,
  );
}

function resolveSourceTextureName(frameState: RenderFrameState): 'layerComposite' | 'original' {
  return frameState.composition === null ? 'original' : 'layerComposite';
}

export function shouldRunBeautyPass(frameState: RenderFrameState): boolean {
  return frameState.aiState.beauty.active && frameState.aiState.faceRegions.length > 0;
}

export class BeautyPass implements RenderGraphPass {
  public readonly bypassInPreview = true;

  private resources: BeautyPassResources | null = null;

  initialize(context: WebGLRenderingContext, _resources: RenderGraphResources): void {
    if (this.resources !== null) {
      this.dispose(context, _resources);
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
    resources: RenderGraphResources,
    frameState: RenderFrameState,
  ): void {
    if (this.resources === null) {
      throw new Error('BeautyPass render invoked before initialization.');
    }

    const faceRegion = findRegion(frameState.aiState.faceRegions, 'face');

    if (!shouldRunBeautyPass(frameState) || faceRegion === null) {
      return;
    }

    const foreheadRegion = findRegion(frameState.aiState.faceRegions, 'forehead');
    const leftUnderEyeRegion = findRegion(frameState.aiState.faceRegions, 'left-under-eye');
    const rightUnderEyeRegion = findRegion(frameState.aiState.faceRegions, 'right-under-eye');

    context.bindFramebuffer(
      context.FRAMEBUFFER,
      resources.resourcePool.getFramebuffer('beautyProcessed'),
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
      resources.resourcePool.getTexture(resolveSourceTextureName(frameState)),
    );
    context.uniform2f(
      this.resources.textureSizeUniform,
      resources.internalWidth,
      resources.internalHeight,
    );
    bindRegionUniform(context, this.resources.faceBoundsUniform, faceRegion);
    bindRegionUniform(context, this.resources.foreheadBoundsUniform, foreheadRegion);
    bindRegionUniform(context, this.resources.leftUnderEyeBoundsUniform, leftUnderEyeRegion);
    bindRegionUniform(context, this.resources.rightUnderEyeBoundsUniform, rightUnderEyeRegion);
    context.uniform1i(this.resources.hasFaceUniform, 1);
    context.uniform1f(
      this.resources.skinSmoothingUniform,
      frameState.aiState.beauty.settings.skinSmoothing,
    );
    context.uniform1f(
      this.resources.detailPreservationUniform,
      frameState.aiState.beauty.settings.detailPreservation,
    );
    context.uniform1f(
      this.resources.complexionBalancingUniform,
      frameState.aiState.beauty.settings.complexionBalancing,
    );
    context.uniform1f(
      this.resources.underEyeSofteningUniform,
      frameState.aiState.beauty.settings.underEyeSoftening,
    );
    context.drawArrays(context.TRIANGLE_STRIP, 0, 4);
    context.bindFramebuffer(context.FRAMEBUFFER, null);
  }

  dispose(context: WebGLRenderingContext, _resources: RenderGraphResources): void {
    if (this.resources === null) {
      return;
    }

    context.deleteBuffer(this.resources.positionBuffer);
    context.deleteBuffer(this.resources.textureCoordBuffer);
    context.deleteProgram(this.resources.program);
    this.resources = null;
  }
}
