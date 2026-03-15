export type HardwareTier = 'HIGH' | 'LOW' | 'MEDIUM';

export interface PerformanceProfile {
  readonly gpuBenchmarkMs: number;
  readonly hardwareConcurrency: number;
  readonly profiledAt: number;
  readonly tier: HardwareTier;
}

const vertexShaderSource = `
  attribute vec2 aPosition;

  void main(void) {
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

const fragmentShaderSource = `
  precision mediump float;

  void main(void) {
    vec2 uv = gl_FragCoord.xy / vec2(256.0, 256.0);
    float noise = sin(uv.x * 90.0) * cos(uv.y * 90.0);
    gl_FragColor = vec4(vec3(uv, noise * 0.5 + 0.5), 1.0);
  }
`;

function classifyHardwareTier(
  hardwareConcurrency: number,
  gpuBenchmarkMs: number,
): HardwareTier {
  if (hardwareConcurrency <= 4 || gpuBenchmarkMs >= 18) {
    return 'LOW';
  }

  if (hardwareConcurrency >= 8 && gpuBenchmarkMs <= 8) {
    return 'HIGH';
  }

  return 'MEDIUM';
}

function isWebglRenderingContext(value: unknown): value is WebGLRenderingContext {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<WebGLRenderingContext>;

  return (
    typeof candidate.clear === 'function' &&
    typeof candidate.createShader === 'function' &&
    typeof candidate.viewport === 'function'
  );
}

function getProfileContext(canvas: HTMLCanvasElement): WebGLRenderingContext | null {
  const contextOptions: WebGLContextAttributes = {
    alpha: false,
    antialias: false,
    preserveDrawingBuffer: false,
  };
  const primaryContext = canvas.getContext('webgl', contextOptions);

  if (isWebglRenderingContext(primaryContext)) {
    return primaryContext;
  }

  const fallbackContext = canvas.getContext('experimental-webgl', contextOptions);

  return isWebglRenderingContext(fallbackContext) ? fallbackContext : null;
}

function compileShader(
  context: WebGLRenderingContext,
  shaderType: number,
  source: string,
): WebGLShader {
  const shader = context.createShader(shaderType);

  if (shader === null) {
    throw new Error('Failed to allocate a WebGL shader for performance profiling.');
  }

  context.shaderSource(shader, source);
  context.compileShader(shader);

  if (context.getShaderParameter(shader, context.COMPILE_STATUS) !== true) {
    const message = context.getShaderInfoLog(shader) ?? 'Unknown profiler shader error.';
    context.deleteShader(shader);
    throw new Error(message);
  }

  return shader;
}

export function profileHardware(): Promise<PerformanceProfile> {
  const hardwareConcurrency =
    typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number'
      ? navigator.hardwareConcurrency
      : 4;

  if (typeof document === 'undefined') {
    return Promise.resolve({
      gpuBenchmarkMs: 16,
      hardwareConcurrency,
      profiledAt: Date.now(),
      tier: classifyHardwareTier(hardwareConcurrency, 16),
    });
  }

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = getProfileContext(canvas);

  if (context === null) {
    const fallbackGpuBenchmarkMs = 20;

    return Promise.resolve({
      gpuBenchmarkMs: fallbackGpuBenchmarkMs,
      hardwareConcurrency,
      profiledAt: Date.now(),
      tier: classifyHardwareTier(hardwareConcurrency, fallbackGpuBenchmarkMs),
    });
  }

  const benchmarkStartMs = performance.now();
  const vertexShader = compileShader(context, context.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = compileShader(context, context.FRAGMENT_SHADER, fragmentShaderSource);
  const program = context.createProgram();

  if (program === null) {
    context.deleteShader(vertexShader);
    context.deleteShader(fragmentShader);
    throw new Error('Failed to allocate a WebGL program for performance profiling.');
  }

  context.attachShader(program, vertexShader);
  context.attachShader(program, fragmentShader);
  context.linkProgram(program);
  context.deleteShader(vertexShader);
  context.deleteShader(fragmentShader);

  if (context.getProgramParameter(program, context.LINK_STATUS) !== true) {
    const message = context.getProgramInfoLog(program) ?? 'Unknown profiler link error.';
    context.deleteProgram(program);
    throw new Error(message);
  }

  const positionBuffer = context.createBuffer();
  const positionLocation = context.getAttribLocation(program, 'aPosition');

  if (positionBuffer === null || positionLocation === -1) {
    if (positionBuffer !== null) {
      context.deleteBuffer(positionBuffer);
    }

    context.deleteProgram(program);
    throw new Error('Failed to allocate profiler geometry resources.');
  }

  context.bindBuffer(context.ARRAY_BUFFER, positionBuffer);
  context.bufferData(
    context.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    context.STATIC_DRAW,
  );
  context.useProgram(program);
  context.enableVertexAttribArray(positionLocation);
  context.vertexAttribPointer(positionLocation, 2, context.FLOAT, false, 0, 0);
  context.viewport(0, 0, 256, 256);
  context.drawArrays(context.TRIANGLE_STRIP, 0, 4);
  context.finish();

  const readBuffer = new Uint8Array(256 * 256 * 4);
  context.readPixels(0, 0, 256, 256, context.RGBA, context.UNSIGNED_BYTE, readBuffer);
  context.finish();

  const gpuBenchmarkMs = performance.now() - benchmarkStartMs;

  context.deleteBuffer(positionBuffer);
  context.deleteProgram(program);

  return Promise.resolve({
    gpuBenchmarkMs,
    hardwareConcurrency,
    profiledAt: Date.now(),
    tier: classifyHardwareTier(hardwareConcurrency, gpuBenchmarkMs),
  });
}
