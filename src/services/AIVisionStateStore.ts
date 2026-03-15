import {
  defaultBeautyRuntimeState,
  defaultBeautySettings,
  type BeautyRuntimeState,
  type BeautySettings,
} from '../types/beauty';
import type {
  VisionEnabledFeatures,
  VisionInferenceResults,
  VisionProcessingConfig,
} from '../types/vision';

export interface SharedAIFrameState {
  readonly beautyRuntime: BeautyRuntimeState;
  readonly beautySettings: BeautySettings;
  readonly enabledFeatures: VisionEnabledFeatures;
  readonly processingConfig: VisionProcessingConfig;
  readonly results: VisionInferenceResults | null;
}

type AIStateListener = () => void;

const listeners = new Set<AIStateListener>();

let sharedState: SharedAIFrameState = {
  beautyRuntime: defaultBeautyRuntimeState,
  beautySettings: defaultBeautySettings,
  enabledFeatures: {
    backgroundBlur: false,
    faceTracking: false,
  },
  processingConfig: {
    backgroundBlurStrength: 0.65,
    frameSampleSize: 384,
    maxInferenceFps: 18,
    pauseWhenHidden: true,
  },
  results: null,
};

function notifyListeners(): void {
  listeners.forEach((listener: AIStateListener): void => {
    listener();
  });
}

export function getAIFrameState(): SharedAIFrameState {
  return sharedState;
}

export function setAIFrameState(nextState: SharedAIFrameState): void {
  sharedState = nextState;
  notifyListeners();
}

export function updateAIFrameState(
  updater: (currentState: SharedAIFrameState) => SharedAIFrameState,
): void {
  sharedState = updater(sharedState);
  notifyListeners();
}

export function resetAIFrameState(): void {
  sharedState = {
    beautyRuntime: defaultBeautyRuntimeState,
    beautySettings: defaultBeautySettings,
    enabledFeatures: {
      backgroundBlur: false,
      faceTracking: false,
    },
    processingConfig: {
      backgroundBlurStrength: 0.65,
      frameSampleSize: 384,
      maxInferenceFps: 18,
      pauseWhenHidden: true,
    },
    results: null,
  };
  notifyListeners();
}

export function subscribeToAIFrameState(listener: AIStateListener): () => void {
  listeners.add(listener);

  return (): void => {
    listeners.delete(listener);
  };
}
