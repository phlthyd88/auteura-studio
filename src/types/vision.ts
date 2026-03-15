export interface VisionEnabledFeatures {
  readonly backgroundBlur: boolean;
  readonly faceTracking: boolean;
}

export interface VisionProcessingConfig {
  readonly backgroundBlurStrength: number;
  readonly frameSampleSize: number;
  readonly maxInferenceFps: number;
  readonly pauseWhenHidden: boolean;
}

export interface VisionRuntimeDiagnostics {
  readonly averageProcessingDurationMs: number;
  readonly consecutiveWorkerErrors: number;
  readonly droppedBusyFrames: number;
  readonly lastCompletedAtMs: number | null;
  readonly lastProcessingDurationMs: number | null;
  readonly lastSubmittedAtMs: number | null;
  readonly processedFrameCount: number;
  readonly skippedCadenceFrames: number;
  readonly skippedDuplicateFrames: number;
  readonly skippedHiddenFrames: number;
  readonly skippedNotReadyFrames: number;
  readonly submittedFrameCount: number;
  readonly workerErrorCount: number;
}

export type VisionInitializationStage =
  | 'idle'
  | 'validating-assets'
  | 'starting-worker'
  | 'initializing-models'
  | 'ready'
  | 'error';

export interface VisionModelPaths {
  readonly faceLandmarkerTaskPath: string;
  readonly imageSegmenterTaskPath: string;
  readonly wasmRootPath: string;
}

export interface VisionFaceLandmark {
  readonly visibility: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface VisionNormalizedPoint {
  readonly x: number;
  readonly y: number;
}

export interface VisionFaceRegionBounds {
  readonly center: VisionNormalizedPoint;
  readonly height: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
}

export interface VisionFaceRegion {
  readonly bounds: VisionFaceRegionBounds;
  readonly confidence: number;
  readonly kind:
    | 'face'
    | 'forehead'
    | 'left-eye'
    | 'right-eye'
    | 'left-under-eye'
    | 'right-under-eye'
    | 'mouth';
}

export interface VisionBlendshapeCategory {
  readonly categoryName: string;
  readonly displayName: string;
  readonly index: number;
  readonly score: number;
}

export interface VisionBlendshapeClassification {
  readonly categories: readonly VisionBlendshapeCategory[];
  readonly headIndex: number;
  readonly headName: string;
}

export interface VisionMatrix {
  readonly columns: number;
  readonly data: readonly number[];
  readonly rows: number;
}

export interface VisionFaceTrackingResult {
  readonly blendshapes: readonly VisionBlendshapeClassification[];
  readonly landmarks: readonly VisionFaceLandmark[];
  readonly regions: readonly VisionFaceRegion[];
  readonly transformationMatrix: VisionMatrix | null;
}

export interface VisionSegmentationMask {
  readonly data: Uint8Array;
  readonly height: number;
  readonly labels: readonly string[];
  readonly width: number;
}

export interface VisionInferenceResults {
  readonly faces: readonly VisionFaceTrackingResult[];
  readonly processingDurationMs: number;
  readonly requestId: number;
  readonly segmentationMask: VisionSegmentationMask | null;
  readonly timestamp: number;
}

export interface VisionInitMessage {
  readonly payload: {
    readonly enabledFeatures: VisionEnabledFeatures;
    readonly modelPaths: VisionModelPaths;
  };
  readonly type: 'INIT';
}

export interface VisionSetConfigMessage {
  readonly payload: {
    readonly enabledFeatures: VisionEnabledFeatures;
    readonly processingConfig: VisionProcessingConfig;
  };
  readonly type: 'SET_CONFIG';
}

export interface VisionDisposeMessage {
  readonly type: 'DISPOSE';
}

export interface VisionProcessFrameBitmapMessage {
  readonly payload: {
    readonly frame: ImageBitmap;
    readonly frameType: 'image-bitmap';
    readonly requestId: number;
    readonly timestamp: number;
  };
  readonly type: 'PROCESS_FRAME';
}

export interface VisionProcessFrameDataMessage {
  readonly payload: {
    readonly frame: ImageData;
    readonly frameType: 'image-data';
    readonly requestId: number;
    readonly timestamp: number;
  };
  readonly type: 'PROCESS_FRAME';
}

export type VisionWorkerMessage =
  | VisionDisposeMessage
  | VisionInitMessage
  | VisionProcessFrameBitmapMessage
  | VisionProcessFrameDataMessage
  | VisionSetConfigMessage;

export interface VisionInitSuccessResponse {
  readonly payload: {
    readonly enabledFeatures: VisionEnabledFeatures;
    readonly ready: true;
  };
  readonly type: 'INIT_SUCCESS';
}

export interface VisionInitErrorResponse {
  readonly payload: {
    readonly code: 'model-init-failed';
    readonly message: string;
  };
  readonly type: 'INIT_ERROR';
}

export interface VisionResultsResponse {
  readonly payload: VisionInferenceResults;
  readonly type: 'RESULTS';
}

export interface VisionSkippedResponse {
  readonly payload: {
    readonly reason: 'models-not-ready';
    readonly requestId: number;
    readonly timestamp: number;
  };
  readonly type: 'SKIPPED';
}

export interface VisionErrorResponse {
  readonly payload: {
    readonly message: string;
    readonly requestId: number | null;
  };
  readonly type: 'ERROR';
}

export type VisionWorkerResponse =
  | VisionErrorResponse
  | VisionInitErrorResponse
  | VisionInitSuccessResponse
  | VisionSkippedResponse
  | VisionResultsResponse;
