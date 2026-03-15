import { type LoadedLut } from '../../types/color';
import { type RenderFrameState, RenderMode } from '../../types/render';
import type { RenderGraphPass, RenderGraphResources } from '../RenderGraph';

interface CoreColorPassResources {
  readonly backgroundBlurStrengthUniform: WebGLUniformLocation;
  readonly bypassUniform: WebGLUniformLocation;
  readonly contrastUniform: WebGLUniformLocation;
  readonly exposureUniform: WebGLUniformLocation;
  readonly gainUniform: WebGLUniformLocation;
  readonly gammaUniform: WebGLUniformLocation;
  readonly grainUniform: WebGLUniformLocation;
  readonly liftUniform: WebGLUniformLocation;
  readonly lutIntensityUniform: WebGLUniformLocation;
  readonly lutSizeUniform: WebGLUniformLocation;
  readonly lutTexture: WebGLTexture;
  readonly lutTextureUniform: WebGLUniformLocation;
  readonly maskSizeUniform: WebGLUniformLocation;
  readonly maskTextureUniform: WebGLUniformLocation;
  readonly modeUniform: WebGLUniformLocation;
  readonly panUniform: WebGLUniformLocation;
  readonly positionBuffer: WebGLBuffer;
  readonly positionLocation: number;
  readonly program: WebGLProgram;
  readonly rotationUniform: WebGLUniformLocation;
  readonly saturationUniform: WebGLUniformLocation;
  readonly temperatureUniform: WebGLUniformLocation;
  readonly textureCoordBuffer: WebGLBuffer;
  readonly textureCoordLocation: number;
  readonly timeUniform: WebGLUniformLocation;
  readonly tintUniform: WebGLUniformLocation;
  readonly useSegmentationMaskUniform: WebGLUniformLocation;
  readonly useLutUniform: WebGLUniformLocation;
  readonly vignetteUniform: WebGLUniformLocation;
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
  uniform sampler2D uTexture;
  uniform sampler2D uLutTexture;
  uniform sampler2D uMaskTexture;
  uniform int uMode;
  uniform int uBypass;
  uniform int uUseLut;
  uniform int uUseSegmentationMask;
  uniform float uExposure;
  uniform float uContrast;
  uniform float uSaturation;
  uniform float uTemperature;
  uniform float uTint;
  uniform vec3 uLift;
  uniform vec3 uGamma;
  uniform vec3 uGain;
  uniform float uVignette;
  uniform float uGrain;
  uniform float uLutSize;
  uniform float uLutIntensity;
  uniform float uBackgroundBlurStrength;
  uniform float uZoom;
  uniform vec2 uPan;
  uniform vec2 uBlurReferenceSize;
  uniform float uRotation;
  uniform vec2 uFlip;
  uniform float uTime;

  vec3 applyLut(vec3 color) {
    float lutSize = max(uLutSize, 2.0);
    vec3 scaled = clamp(color, 0.0, 1.0) * (lutSize - 1.0);
    float blueSlice = scaled.b;
    float sliceFloor = floor(blueSlice);
    float sliceCeil = min(lutSize - 1.0, sliceFloor + 1.0);
    float sliceMix = fract(blueSlice);

    vec2 sampleCoordA = vec2(
      (scaled.r + sliceFloor * lutSize + 0.5) / (lutSize * lutSize),
      (scaled.g + 0.5) / lutSize
    );
    vec2 sampleCoordB = vec2(
      (scaled.r + sliceCeil * lutSize + 0.5) / (lutSize * lutSize),
      (scaled.g + 0.5) / lutSize
    );

    vec3 lutColorA = texture2D(uLutTexture, sampleCoordA).rgb;
    vec3 lutColorB = texture2D(uLutTexture, sampleCoordB).rgb;
    vec3 lutColor = mix(lutColorA, lutColorB, sliceMix);

    return mix(color, lutColor, uLutIntensity);
  }

  vec3 sampleBackgroundBlur(vec2 sampleCoord) {
    vec2 pixelSize = 1.0 / max(uBlurReferenceSize, vec2(1.0, 1.0));
    vec2 blurOffset = pixelSize * mix(2.0, 10.0, clamp(uBackgroundBlurStrength, 0.0, 1.0));
    vec3 blurredColor = vec3(0.0);

    blurredColor += texture2D(uTexture, sampleCoord).rgb * 0.2;
    blurredColor += texture2D(uTexture, sampleCoord + vec2(blurOffset.x, 0.0)).rgb * 0.15;
    blurredColor += texture2D(uTexture, sampleCoord - vec2(blurOffset.x, 0.0)).rgb * 0.15;
    blurredColor += texture2D(uTexture, sampleCoord + vec2(0.0, blurOffset.y)).rgb * 0.15;
    blurredColor += texture2D(uTexture, sampleCoord - vec2(0.0, blurOffset.y)).rgb * 0.15;
    blurredColor += texture2D(uTexture, sampleCoord + blurOffset).rgb * 0.1;
    blurredColor += texture2D(uTexture, sampleCoord - blurOffset).rgb * 0.1;

    return blurredColor;
  }

  vec2 getSampleCoord() {
    vec2 centeredCoord = vTexCoord - 0.5 - uPan;
    centeredCoord /= max(uZoom, 0.001);
    centeredCoord *= uFlip;

    float rotation = radians(uRotation);
    mat2 rotationMatrix = mat2(cos(rotation), -sin(rotation), sin(rotation), cos(rotation));
    return rotationMatrix * centeredCoord + 0.5;
  }

  void main(void) {
    vec2 sampleCoord = getSampleCoord();

    if (sampleCoord.x < 0.0 || sampleCoord.x > 1.0 || sampleCoord.y < 0.0 || sampleCoord.y > 1.0) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }

    vec4 color = texture2D(uTexture, sampleCoord);

    if (uBypass == 0) {
      color.rgb *= pow(2.0, uExposure);
      color.rgb = ((color.rgb - 0.5) * uContrast) + 0.5;

      float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
      color.rgb = mix(vec3(luma), color.rgb, uSaturation);

      color.rgb += vec3(uTemperature * 0.08, 0.0, -uTemperature * 0.08);
      color.rgb += vec3(uTint * 0.05, -uTint * 0.05, uTint * 0.02);

      color.rgb = max(color.rgb + uLift, 0.0);
      color.rgb = pow(max(color.rgb, 0.0001), vec3(1.0) / max(uGamma, vec3(0.001)));
      color.rgb *= uGain;

      if (uUseLut == 1) {
        color.rgb = applyLut(color.rgb);
      }

      float vignetteMask = smoothstep(0.25, 0.95, distance(sampleCoord, vec2(0.5)));
      color.rgb *= 1.0 - (vignetteMask * uVignette * 0.9);

      float grainNoise = fract(
        sin(dot(sampleCoord * vec2(923.0, 701.0) + vec2(uTime), vec2(12.9898, 78.233))) *
        43758.5453
      );
      color.rgb += (grainNoise - 0.5) * uGrain * 0.08;
    }

    if (uUseSegmentationMask == 1) {
      float rawMask = texture2D(uMaskTexture, sampleCoord).r;
      float normalizedMask = rawMask > 0.5 ? rawMask : clamp(rawMask * 255.0, 0.0, 1.0);
      float foregroundMask = smoothstep(0.1, 0.9, normalizedMask);
      vec3 blurredBackground = sampleBackgroundBlur(sampleCoord);
      color.rgb = mix(blurredBackground, color.rgb, foregroundMask);
    }

    if (uMode == 1) {
      float monochromeLuma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
      gl_FragColor = vec4(vec3(monochromeLuma), 1.0);
      return;
    }

    if (uMode == 2) {
      gl_FragColor = vec4(1.0 - color.rgb, 1.0);
      return;
    }

    gl_FragColor = color;
  }
`;

function resolveSourceTextureName(
  frameState: RenderFrameState,
): 'beautyProcessed' | 'layerComposite' | 'original' {
  if (frameState.aiState.beauty.active && frameState.aiState.faceRegions.length > 0) {
    return 'beautyProcessed';
  }

  return frameState.composition === null ? 'original' : 'layerComposite';
}

function createShader(
  context: WebGLRenderingContext,
  shaderType: number,
  source: string,
): WebGLShader {
  const shader = context.createShader(shaderType);

  if (shader === null) {
    throw new Error('Failed to create a WebGL shader.');
  }

  context.shaderSource(shader, source);
  context.compileShader(shader);

  if (context.getShaderParameter(shader, context.COMPILE_STATUS) !== true) {
    const message = context.getShaderInfoLog(shader) ?? 'Unknown shader compilation error.';
    context.deleteShader(shader);
    throw new Error(message);
  }

  return shader;
}

function createResources(context: WebGLRenderingContext): CoreColorPassResources {
  const vertexShader = createShader(context, context.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = createShader(context, context.FRAGMENT_SHADER, fragmentShaderSource);
  const program = context.createProgram();

  if (program === null) {
    context.deleteShader(vertexShader);
    context.deleteShader(fragmentShader);
    throw new Error('Failed to create a WebGL program.');
  }

  context.attachShader(program, vertexShader);
  context.attachShader(program, fragmentShader);
  context.linkProgram(program);
  context.deleteShader(vertexShader);
  context.deleteShader(fragmentShader);

  if (context.getProgramParameter(program, context.LINK_STATUS) !== true) {
    const message = context.getProgramInfoLog(program) ?? 'Unknown program link error.';
    context.deleteProgram(program);
    throw new Error(message);
  }

  const positionBuffer = context.createBuffer();
  const textureCoordBuffer = context.createBuffer();
  const lutTexture = context.createTexture();
  const positionLocation = context.getAttribLocation(program, 'aPosition');
  const textureCoordLocation = context.getAttribLocation(program, 'aTexCoord');
  const samplerUniform = context.getUniformLocation(program, 'uTexture');
  const lutTextureUniform = context.getUniformLocation(program, 'uLutTexture');
  const maskTextureUniform = context.getUniformLocation(program, 'uMaskTexture');
  const modeUniform = context.getUniformLocation(program, 'uMode');
  const bypassUniform = context.getUniformLocation(program, 'uBypass');
  const useLutUniform = context.getUniformLocation(program, 'uUseLut');
  const useSegmentationMaskUniform = context.getUniformLocation(program, 'uUseSegmentationMask');
  const exposureUniform = context.getUniformLocation(program, 'uExposure');
  const contrastUniform = context.getUniformLocation(program, 'uContrast');
  const saturationUniform = context.getUniformLocation(program, 'uSaturation');
  const temperatureUniform = context.getUniformLocation(program, 'uTemperature');
  const tintUniform = context.getUniformLocation(program, 'uTint');
  const liftUniform = context.getUniformLocation(program, 'uLift');
  const gammaUniform = context.getUniformLocation(program, 'uGamma');
  const gainUniform = context.getUniformLocation(program, 'uGain');
  const vignetteUniform = context.getUniformLocation(program, 'uVignette');
  const grainUniform = context.getUniformLocation(program, 'uGrain');
  const lutSizeUniform = context.getUniformLocation(program, 'uLutSize');
  const lutIntensityUniform = context.getUniformLocation(program, 'uLutIntensity');
  const backgroundBlurStrengthUniform = context.getUniformLocation(program, 'uBackgroundBlurStrength');
  const zoomUniform = context.getUniformLocation(program, 'uZoom');
  const panUniform = context.getUniformLocation(program, 'uPan');
  const maskSizeUniform = context.getUniformLocation(program, 'uBlurReferenceSize');
  const rotationUniform = context.getUniformLocation(program, 'uRotation');
  const flipUniform = context.getUniformLocation(program, 'uFlip');
  const timeUniform = context.getUniformLocation(program, 'uTime');

  if (
    positionBuffer === null ||
    textureCoordBuffer === null ||
    lutTexture === null ||
    positionLocation === -1 ||
    textureCoordLocation === -1 ||
    samplerUniform === null ||
    lutTextureUniform === null ||
    maskTextureUniform === null ||
    modeUniform === null ||
    bypassUniform === null ||
    useLutUniform === null ||
    useSegmentationMaskUniform === null ||
    exposureUniform === null ||
    contrastUniform === null ||
    saturationUniform === null ||
    temperatureUniform === null ||
    tintUniform === null ||
    liftUniform === null ||
    gammaUniform === null ||
    gainUniform === null ||
    vignetteUniform === null ||
    grainUniform === null ||
    lutSizeUniform === null ||
    lutIntensityUniform === null ||
    backgroundBlurStrengthUniform === null ||
    zoomUniform === null ||
    panUniform === null ||
    maskSizeUniform === null ||
    rotationUniform === null ||
    flipUniform === null ||
    timeUniform === null
  ) {
    if (positionBuffer !== null) {
      context.deleteBuffer(positionBuffer);
    }

    if (textureCoordBuffer !== null) {
      context.deleteBuffer(textureCoordBuffer);
    }

    if (lutTexture !== null) {
      context.deleteTexture(lutTexture);
    }

    context.deleteProgram(program);
    throw new Error('Failed to initialize WebGL attribute or uniform locations.');
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

  context.bindTexture(context.TEXTURE_2D, lutTexture);
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE);
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE);
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.LINEAR);
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.LINEAR);
  context.texImage2D(
    context.TEXTURE_2D,
    0,
    context.RGBA,
    1,
    1,
    0,
    context.RGBA,
    context.UNSIGNED_BYTE,
    new Uint8Array([255, 255, 255, 255]),
  );

  context.useProgram(program);
  context.uniform1i(samplerUniform, 0);
  context.uniform1i(lutTextureUniform, 1);
  context.uniform1i(maskTextureUniform, 2);
  context.clearColor(0.02, 0.03, 0.08, 1);

  return {
    backgroundBlurStrengthUniform,
    bypassUniform,
    contrastUniform,
    exposureUniform,
    gainUniform,
    gammaUniform,
    grainUniform,
    liftUniform,
    lutIntensityUniform,
    lutSizeUniform,
    lutTexture,
    lutTextureUniform,
    maskTextureUniform,
    maskSizeUniform,
    modeUniform,
    panUniform,
    positionBuffer,
    positionLocation,
    program,
    rotationUniform,
    saturationUniform,
    temperatureUniform,
    textureCoordBuffer,
    textureCoordLocation,
    timeUniform,
    tintUniform,
    useSegmentationMaskUniform,
    useLutUniform,
    vignetteUniform,
    zoomUniform,
    flipUniform,
  };
}

function getModeValue(mode: RenderMode): number {
  if (mode === RenderMode.Monochrome) {
    return 1;
  }

  if (mode === RenderMode.Inverted) {
    return 2;
  }

  return 0;
}

export class CoreColorPass implements RenderGraphPass {
  private resources: CoreColorPassResources | null = null;

  private activeLutKey: string | null = null;

  initialize(context: WebGLRenderingContext, _graphResources: RenderGraphResources): void {
    if (this.resources !== null) {
      this.dispose(context, _graphResources);
    }

    this.resources = createResources(context);
  }

  resize(
    _context: WebGLRenderingContext,
    _graphResources: RenderGraphResources,
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
      throw new Error('CoreColorPass render invoked before initialization.');
    }

    context.bindFramebuffer(
      context.FRAMEBUFFER,
      graphResources.resourcePool.getFramebuffer('processed'),
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
    context.bindTexture(
      context.TEXTURE_2D,
      graphResources.resourcePool.getTexture(resolveSourceTextureName(frameState)),
    );
    this.bindLutTexture(context, frameState.activeLut);
    this.bindSegmentationMaskTexture(context, graphResources, frameState.aiState);
    context.uniform1i(this.resources.bypassUniform, frameState.colorGrading.bypass ? 1 : 0);
    context.uniform1f(this.resources.exposureUniform, frameState.colorGrading.exposure);
    context.uniform1f(this.resources.contrastUniform, frameState.colorGrading.contrast);
    context.uniform1f(this.resources.saturationUniform, frameState.colorGrading.saturation);
    context.uniform1f(this.resources.temperatureUniform, frameState.colorGrading.temperature);
    context.uniform1f(this.resources.tintUniform, frameState.colorGrading.tint);
    context.uniform3f(
      this.resources.liftUniform,
      frameState.colorGrading.lift.red,
      frameState.colorGrading.lift.green,
      frameState.colorGrading.lift.blue,
    );
    context.uniform3f(
      this.resources.gammaUniform,
      frameState.colorGrading.gamma.red,
      frameState.colorGrading.gamma.green,
      frameState.colorGrading.gamma.blue,
    );
    context.uniform3f(
      this.resources.gainUniform,
      frameState.colorGrading.gain.red,
      frameState.colorGrading.gain.green,
      frameState.colorGrading.gain.blue,
    );
    context.uniform1f(this.resources.vignetteUniform, frameState.colorGrading.vignette);
    context.uniform1f(this.resources.grainUniform, frameState.colorGrading.grain);
    context.uniform1f(this.resources.lutIntensityUniform, frameState.colorGrading.lutIntensity);
    context.uniform1f(
      this.resources.backgroundBlurStrengthUniform,
      frameState.aiState.backgroundBlurStrength,
    );
    context.uniform1f(this.resources.zoomUniform, frameState.transform.zoom);
    context.uniform2f(this.resources.panUniform, frameState.transform.panX, frameState.transform.panY);
    context.uniform1f(this.resources.rotationUniform, frameState.transform.rotationDeg);
    context.uniform2f(
      this.resources.flipUniform,
      frameState.transform.flipX ? -1 : 1,
      frameState.transform.flipY ? -1 : 1,
    );
    context.uniform1f(this.resources.timeUniform, frameState.timeSeconds);
    context.uniform1i(this.resources.modeUniform, getModeValue(frameState.mode));
    context.drawArrays(context.TRIANGLE_STRIP, 0, 4);
    context.bindFramebuffer(context.FRAMEBUFFER, null);
  }

  dispose(context: WebGLRenderingContext, _graphResources: RenderGraphResources): void {
    if (this.resources === null) {
      return;
    }

    context.deleteBuffer(this.resources.positionBuffer);
    context.deleteBuffer(this.resources.textureCoordBuffer);
    context.deleteTexture(this.resources.lutTexture);
    context.deleteProgram(this.resources.program);
    this.resources = null;
    this.activeLutKey = null;
  }

  private bindLutTexture(context: WebGLRenderingContext, lut: LoadedLut | null): void {
    if (this.resources === null) {
      return;
    }

    context.activeTexture(context.TEXTURE1);
    context.bindTexture(context.TEXTURE_2D, this.resources.lutTexture);

    if (lut === null) {
      context.uniform1i(this.resources.useLutUniform, 0);
      context.uniform1f(this.resources.lutSizeUniform, 2);
      this.activeLutKey = null;
      return;
    }

    if (this.activeLutKey !== lut.cacheKey) {
      context.texImage2D(
        context.TEXTURE_2D,
        0,
        context.RGBA,
        lut.textureWidth,
        lut.textureHeight,
        0,
        context.RGBA,
        context.UNSIGNED_BYTE,
        lut.textureData,
      );
      this.activeLutKey = lut.cacheKey;
    }

    context.uniform1i(this.resources.useLutUniform, 1);
    context.uniform1f(this.resources.lutSizeUniform, lut.size);
  }

  private bindSegmentationMaskTexture(
    context: WebGLRenderingContext,
    graphResources: RenderGraphResources,
    aiState: RenderFrameState['aiState'],
  ): void {
    if (this.resources === null) {
      return;
    }

    context.activeTexture(context.TEXTURE2);
    context.bindTexture(
      context.TEXTURE_2D,
      graphResources.resourcePool.getTexture('refinedMask'),
    );

    if (!aiState.backgroundBlurEnabled || aiState.segmentationMask === null) {
      context.uniform1i(this.resources.useSegmentationMaskUniform, 0);
      context.uniform2f(
        this.resources.maskSizeUniform,
        graphResources.internalWidth,
        graphResources.internalHeight,
      );
      return;
    }
    context.uniform1i(this.resources.useSegmentationMaskUniform, 1);
    context.uniform2f(
      this.resources.maskSizeUniform,
      graphResources.internalWidth,
      graphResources.internalHeight,
    );
  }
}
