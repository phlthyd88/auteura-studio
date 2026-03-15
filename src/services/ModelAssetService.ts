import type { VisionModelPaths } from '../types/vision';

export type VisionRuntimeAssetKind = 'model' | 'wasm-binary' | 'wasm-loader';

export interface VisionRuntimeAssetDescriptor {
  readonly kind: VisionRuntimeAssetKind;
  readonly label: string;
  readonly path: string;
}

export interface VisionRuntimeAssetCheck {
  readonly asset: VisionRuntimeAssetDescriptor;
  readonly available: boolean;
  readonly message: string;
  readonly method: 'GET' | 'HEAD' | 'none';
  readonly status: number | null;
}

export interface VisionRuntimeAssetValidationResult {
  readonly checkedAt: number;
  readonly checks: readonly VisionRuntimeAssetCheck[];
  readonly ok: boolean;
  readonly summary: string;
}

const validationTimeoutMs = 4000;

function normalizeWasmRootPath(wasmRootPath: string): string {
  return wasmRootPath.endsWith('/') ? wasmRootPath.slice(0, -1) : wasmRootPath;
}

export function getVisionRuntimeAssets(
  modelPaths: VisionModelPaths,
): readonly VisionRuntimeAssetDescriptor[] {
  const wasmRootPath = normalizeWasmRootPath(modelPaths.wasmRootPath);

  return [
    {
      kind: 'model',
      label: 'Face landmarker model',
      path: modelPaths.faceLandmarkerTaskPath,
    },
    {
      kind: 'model',
      label: 'Image segmenter model',
      path: modelPaths.imageSegmenterTaskPath,
    },
    {
      kind: 'wasm-loader',
      label: 'MediaPipe wasm loader',
      path: `${wasmRootPath}/vision_wasm_internal.js`,
    },
    {
      kind: 'wasm-binary',
      label: 'MediaPipe wasm binary',
      path: `${wasmRootPath}/vision_wasm_internal.wasm`,
    },
  ] as const;
}

async function requestAsset(
  path: string,
  method: 'GET' | 'HEAD',
): Promise<Response> {
  const abortController = new AbortController();
  const timeoutId = globalThis.setTimeout((): void => {
    abortController.abort();
  }, validationTimeoutMs);

  try {
    return await fetch(path, {
      cache: 'no-store',
      credentials: 'same-origin',
      method,
      signal: abortController.signal,
    });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

async function probeAsset(
  asset: VisionRuntimeAssetDescriptor,
): Promise<VisionRuntimeAssetCheck> {
  const methods: readonly ('HEAD' | 'GET')[] = ['HEAD', 'GET'];

  for (const method of methods) {
    try {
      const response = await requestAsset(asset.path, method);

      if (method === 'HEAD' && (response.status === 405 || response.status === 501)) {
        continue;
      }

      if (method === 'GET' && response.body !== null) {
        try {
          await response.body.cancel();
        } catch {
          // Best-effort body cancellation keeps validation from downloading large assets in full.
        }
      }

      if (response.ok) {
        return {
          asset,
          available: true,
          message: `${asset.label} is available.`,
          method,
          status: response.status,
        };
      }

      return {
        asset,
        available: false,
        message: `${asset.label} returned HTTP ${response.status}.`,
        method,
        status: response.status,
      };
    } catch (error) {
      if (method === 'HEAD') {
        continue;
      }

      return {
        asset,
        available: false,
        message:
          error instanceof Error
            ? `${asset.label} check failed: ${error.message}`
            : `${asset.label} check failed.`,
        method,
        status: null,
      };
    }
  }

  return {
    asset,
    available: false,
    message: `${asset.label} could not be validated.`,
    method: 'none',
    status: null,
  };
}

function buildValidationSummary(checks: readonly VisionRuntimeAssetCheck[]): string {
  const missingAssets = checks.filter(
    (check: VisionRuntimeAssetCheck): boolean => !check.available,
  );

  if (missingAssets.length === 0) {
    return 'All required AI runtime assets are available.';
  }

  const missingAssetList = missingAssets
    .map((check: VisionRuntimeAssetCheck): string => `${check.asset.label} (${check.asset.path})`)
    .join(', ');

  return `Missing required AI runtime assets: ${missingAssetList}.`;
}

export async function validateVisionRuntimeAssets(
  modelPaths: VisionModelPaths,
): Promise<VisionRuntimeAssetValidationResult> {
  const assets = getVisionRuntimeAssets(modelPaths);
  const checks = await Promise.all(
    assets.map(
      async (asset: VisionRuntimeAssetDescriptor): Promise<VisionRuntimeAssetCheck> =>
        probeAsset(asset),
    ),
  );

  return {
    checkedAt: Date.now(),
    checks,
    ok: checks.every((check: VisionRuntimeAssetCheck): boolean => check.available),
    summary: buildValidationSummary(checks),
  };
}
