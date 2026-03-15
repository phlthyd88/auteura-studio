/// <reference lib="webworker" />

import {
  FaceLandmarker,
  FilesetResolver,
  ImageSegmenter,
  type Classifications,
  type FaceLandmarkerResult,
  type ImageSegmenterResult,
  type Matrix,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision';
import { deriveFaceRegionsFromLandmarks } from '../services/FaceRegionService';
import type {
  VisionEnabledFeatures,
  VisionFaceTrackingResult,
  VisionInferenceResults,
  VisionModelPaths,
  VisionSegmentationMask,
  VisionWorkerMessage,
  VisionWorkerResponse,
} from '../types/vision';

const workerScope: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;

interface MediaPipeWorkerScope extends DedicatedWorkerGlobalScope {
  ModuleFactory?: unknown;
  import?: (specifier: string) => Promise<void>;
}

const mediaPipeWorkerScope = self as MediaPipeWorkerScope;

async function importMediaPipeLoader(specifier: string): Promise<void> {
  const response = await fetch(specifier, {
    cache: 'no-store',
    credentials: 'same-origin',
  });

  if (!response.ok) {
    throw new Error(`Failed to load MediaPipe loader: ${response.status} ${response.statusText}`);
  }

  const source = await response.text();
  const moduleSource = `globalThis.custom_dbg = globalThis.custom_dbg || ((...args) => console.warn(...args));
var custom_dbg = globalThis.custom_dbg;
${source}
export default typeof ModuleFactory !== 'undefined' ? ModuleFactory : undefined;`;
  const blobUrl = URL.createObjectURL(
    new Blob([moduleSource], {
      type: 'text/javascript',
    }),
  );

  try {
    const importedModule = (await import(/* @vite-ignore */ blobUrl)) as {
      readonly default?: unknown;
    };

    if (typeof importedModule.default !== 'function') {
      throw new Error('MediaPipe loader did not expose ModuleFactory.');
    }

    mediaPipeWorkerScope.ModuleFactory = importedModule.default;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

if (typeof mediaPipeWorkerScope.import !== 'function') {
  mediaPipeWorkerScope.import = importMediaPipeLoader;
}

let activeFeatures: VisionEnabledFeatures = {
  backgroundBlur: false,
  faceTracking: false,
};
let faceLandmarker: FaceLandmarker | null = null;
let imageSegmenter: ImageSegmenter | null = null;
let activeModelPaths: VisionModelPaths | null = null;
let segmentationLabels: readonly string[] = [];

function postWorkerMessage(message: VisionWorkerResponse, transfer: Transferable[] = []): void {
  workerScope.postMessage(message, transfer);
}

function mapLandmark(landmark: NormalizedLandmark): VisionFaceTrackingResult['landmarks'][number] {
  return {
    visibility: Number.isFinite(landmark.visibility) ? landmark.visibility : 0,
    x: landmark.x,
    y: landmark.y,
    z: landmark.z,
  };
}

function mapBlendshapeClassifications(
  classifications: readonly Classifications[],
): VisionFaceTrackingResult['blendshapes'] {
  return classifications.map((classification: Classifications) => ({
    categories: classification.categories.map((category) => ({
      categoryName: category.categoryName,
      displayName: category.displayName,
      index: category.index,
      score: category.score,
    })),
    headIndex: classification.headIndex,
    headName: classification.headName,
  }));
}

function mapMatrix(matrix: Matrix | undefined): VisionFaceTrackingResult['transformationMatrix'] {
  if (matrix === undefined) {
    return null;
  }

  return {
    columns: matrix.columns,
    data: [...matrix.data],
    rows: matrix.rows,
  };
}

function mapFaceResults(result: FaceLandmarkerResult): readonly VisionFaceTrackingResult[] {
  return result.faceLandmarks.map(
    (landmarks, index): VisionFaceTrackingResult => {
      const mappedLandmarks = landmarks.map(mapLandmark);

      return {
        blendshapes:
          result.faceBlendshapes[index] === undefined
            ? []
            : mapBlendshapeClassifications([result.faceBlendshapes[index]]),
        landmarks: mappedLandmarks,
        regions: deriveFaceRegionsFromLandmarks(mappedLandmarks),
        transformationMatrix: mapMatrix(result.facialTransformationMatrixes[index]),
      };
    },
  );
}

function extractSegmentationMask(
  result: ImageSegmenterResult,
): VisionSegmentationMask | null {
  const { categoryMask } = result;

  if (categoryMask === undefined) {
    return null;
  }

  try {
    const nextData = categoryMask.getAsUint8Array().slice();

    return {
      data: nextData,
      height: categoryMask.height,
      labels: segmentationLabels,
      width: categoryMask.width,
    };
  } finally {
    categoryMask.close();
  }
}

function closeTransferredFrame(message: VisionWorkerMessage): void {
  if (message.type !== 'PROCESS_FRAME') {
    return;
  }

  if (message.payload.frameType === 'image-bitmap') {
    message.payload.frame.close();
  }
}

function closeTasks(): void {
  if (faceLandmarker !== null) {
    faceLandmarker.close();
    faceLandmarker = null;
  }

  if (imageSegmenter !== null) {
    imageSegmenter.close();
    imageSegmenter = null;
  }

  segmentationLabels = [];
}

function closeFaceLandmarker(): void {
  if (faceLandmarker !== null) {
    faceLandmarker.close();
    faceLandmarker = null;
  }
}

function closeImageSegmenter(): void {
  if (imageSegmenter !== null) {
    imageSegmenter.close();
    imageSegmenter = null;
  }

  segmentationLabels = [];
}

function buildInitializationErrorMessage(
  error: unknown,
  modelPaths: VisionModelPaths,
): string {
  const baseMessage =
    error instanceof Error ? error.message : 'Vision worker initialization failed.';

  if (baseMessage.includes('ModuleFactory not set')) {
    return `MediaPipe wasm loader failed to initialize from ${modelPaths.wasmRootPath}. Verify the wasm runtime files exist and match the worker format.`;
  }

  if (baseMessage.includes('Failed to fetch') || baseMessage.includes('404')) {
    return `Vision model assets could not be loaded. Verify ${modelPaths.faceLandmarkerTaskPath}, ${modelPaths.imageSegmenterTaskPath}, and ${modelPaths.wasmRootPath}.`;
  }

  return baseMessage;
}

async function ensureFaceLandmarker(
  visionFileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
  modelPaths: VisionModelPaths,
): Promise<void> {
  if (faceLandmarker !== null) {
    return;
  }

  faceLandmarker = await FaceLandmarker.createFromOptions(visionFileset, {
    baseOptions: {
      modelAssetPath: modelPaths.faceLandmarkerTaskPath,
    },
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
    runningMode: 'VIDEO',
  });
}

async function ensureImageSegmenter(
  visionFileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
  modelPaths: VisionModelPaths,
): Promise<void> {
  if (imageSegmenter !== null) {
    return;
  }

  imageSegmenter = await ImageSegmenter.createFromOptions(visionFileset, {
    baseOptions: {
      modelAssetPath: modelPaths.imageSegmenterTaskPath,
    },
    outputCategoryMask: true,
    outputConfidenceMasks: false,
    runningMode: 'VIDEO',
  });

  segmentationLabels = imageSegmenter.getLabels();
}

async function syncActiveModels(
  modelPaths: VisionModelPaths,
  enabledFeatures: VisionEnabledFeatures,
): Promise<void> {
  const visionFileset = await FilesetResolver.forVisionTasks(modelPaths.wasmRootPath);

  if (enabledFeatures.faceTracking) {
    await ensureFaceLandmarker(visionFileset, modelPaths);
  } else {
    closeFaceLandmarker();
  }

  if (enabledFeatures.backgroundBlur) {
    await ensureImageSegmenter(visionFileset, modelPaths);
  } else {
    closeImageSegmenter();
  }
}

async function handleWorkerMessage(message: VisionWorkerMessage): Promise<void> {
  if (message.type === 'INIT') {
    activeModelPaths = message.payload.modelPaths;

    try {
      await syncActiveModels(message.payload.modelPaths, message.payload.enabledFeatures);
      activeFeatures = message.payload.enabledFeatures;
      postWorkerMessage({
        payload: {
          enabledFeatures: activeFeatures,
          ready: true,
        },
        type: 'INIT_SUCCESS',
      });
    } catch (error) {
      closeTasks();
      postWorkerMessage({
        payload: {
          code: 'model-init-failed',
          message: buildInitializationErrorMessage(error, message.payload.modelPaths),
        },
        type: 'INIT_ERROR',
      });
    }

    return;
  }

  if (message.type === 'DISPOSE') {
    closeTasks();
    activeModelPaths = null;
    return;
  }

  if (message.type === 'SET_CONFIG') {
    if (activeModelPaths === null) {
      postWorkerMessage({
        payload: {
          message: 'Vision worker configuration changed before initialization completed.',
          requestId: null,
        },
        type: 'ERROR',
      });
      return;
    }

    try {
      await syncActiveModels(activeModelPaths, message.payload.enabledFeatures);
      activeFeatures = message.payload.enabledFeatures;
    } catch (error) {
      postWorkerMessage({
        payload: {
          message:
            error instanceof Error
              ? error.message
              : 'Vision worker failed to update the active feature models.',
          requestId: null,
        },
        type: 'ERROR',
      });
    }

    return;
  }

  const { requestId, timestamp } = message.payload;
  const startedAt = performance.now();

  try {
    if (
      (activeFeatures.faceTracking && faceLandmarker === null) ||
      (activeFeatures.backgroundBlur && imageSegmenter === null)
    ) {
      throw new Error('Vision worker received a frame before the active models were ready.');
    }

    if (!activeFeatures.faceTracking && !activeFeatures.backgroundBlur) {
      const emptyResults: VisionInferenceResults = {
        faces: [],
        processingDurationMs: 0,
        requestId,
        segmentationMask: null,
        timestamp,
      };

      postWorkerMessage({
        payload: emptyResults,
        type: 'RESULTS',
      });
      return;
    }

    const nextFaceLandmarker = faceLandmarker;
    const nextImageSegmenter = imageSegmenter;
    const faces =
      activeFeatures.faceTracking && nextFaceLandmarker !== null
        ? mapFaceResults(nextFaceLandmarker.detectForVideo(message.payload.frame, timestamp))
        : [];
    const segmentationMask =
      activeFeatures.backgroundBlur && nextImageSegmenter !== null
        ? extractSegmentationMask(nextImageSegmenter.segmentForVideo(message.payload.frame, timestamp))
        : null;

    const responsePayload: VisionInferenceResults = {
      faces,
      processingDurationMs: performance.now() - startedAt,
      requestId,
      segmentationMask,
      timestamp,
    };

    const transferables: Transferable[] =
      segmentationMask === null ? [] : [segmentationMask.data.buffer];

    postWorkerMessage(
      {
        payload: responsePayload,
        type: 'RESULTS',
      },
      transferables,
    );
  } catch (error) {
    postWorkerMessage({
      payload: {
        message: error instanceof Error ? error.message : 'Vision frame processing failed.',
        requestId,
      },
      type: 'ERROR',
    });
  } finally {
    closeTransferredFrame(message);
  }
}

workerScope.onmessage = (event: MessageEvent<VisionWorkerMessage>): void => {
  void handleWorkerMessage(event.data);
};

export {};
