import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PropsWithChildren,
} from 'react';
import { useAudioContext } from '../context/AudioContext';
import {
  buildCameraConstraints,
  getCameraCapabilitySummary,
  getCurrentCameraSettings,
  getFrameRateOptions,
  getResolutionOptions,
  resolveRequestedResolutionOption,
  type CameraCapabilitySummary,
  type CameraFormatSettings,
  type CameraResolutionOption,
} from '../services/CameraCapabilityService';
import {
  getCameraErrorDescriptor,
  type CameraErrorCode,
} from '../utils/cameraErrors';

export interface CameraControllerContextValue {
  readonly activeDeviceId: string | null;
  readonly cameraCapabilities: CameraCapabilitySummary | null;
  readonly currentSettings: CameraFormatSettings | null;
  readonly deviceList: readonly MediaDeviceInfo[];
  readonly error: string | null;
  readonly errorCode: CameraErrorCode | null;
  readonly frameRateOptions: readonly number[];
  readonly selectedFrameRate: number | null;
  readonly selectedResolutionId: string;
  readonly resolutionOptions: readonly CameraResolutionOption[];
  readonly stream: MediaStream | null;
  readonly videoRef: MutableRefObject<HTMLVideoElement | null>;
  cycleCameraDevice: () => void;
  refreshDevices: () => Promise<void>;
  setActiveDeviceId: (nextDeviceId: string | null) => void;
  setSelectedFrameRate: (nextFrameRate: number | null) => void;
  setSelectedResolutionId: (nextResolutionId: string) => void;
}

const CameraControllerContext = createContext<CameraControllerContextValue | null>(null);

function stopMediaStream(stream: MediaStream | null): void {
  if (stream === null) {
    return;
  }

  stream.getTracks().forEach((track: MediaStreamTrack): void => {
    track.stop();
  });
}

export function CameraController({ children }: PropsWithChildren): JSX.Element {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const liveInputStreamRef = useRef<MediaStream | null>(null);
  const { setLiveInputStream } = useAudioContext();
  const [deviceList, setDeviceList] = useState<readonly MediaDeviceInfo[]>([]);
  const [activeDeviceIdState, setActiveDeviceIdState] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<CameraErrorCode | null>(null);
  const [hasEnumeratedDevices, setHasEnumeratedDevices] = useState<boolean>(false);
  const [cameraCapabilities, setCameraCapabilities] =
    useState<CameraCapabilitySummary | null>(null);
  const [currentSettings, setCurrentSettings] = useState<CameraFormatSettings | null>(null);
  const [selectedResolutionId, setSelectedResolutionIdState] = useState<string>('auto');
  const [selectedFrameRate, setSelectedFrameRateState] = useState<number | null>(null);

  const supportsMediaDevices =
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices !== 'undefined' &&
    typeof navigator.mediaDevices.getUserMedia === 'function' &&
    typeof navigator.mediaDevices.enumerateDevices === 'function';

  const resolutionOptions = useMemo<readonly CameraResolutionOption[]>(
    (): readonly CameraResolutionOption[] =>
      getResolutionOptions({
        capabilitySummary: cameraCapabilities,
        currentSettings,
      }),
    [cameraCapabilities, currentSettings],
  );

  const selectedResolution = useMemo<CameraResolutionOption>(
    (): CameraResolutionOption => resolveRequestedResolutionOption(selectedResolutionId),
    [selectedResolutionId],
  );

  const frameRateOptions = useMemo<readonly number[]>(
    (): readonly number[] =>
      getFrameRateOptions({
        capabilitySummary: cameraCapabilities,
        currentSettings,
      }),
    [cameraCapabilities, currentSettings],
  );

  const refreshDevices = useCallback(async (): Promise<void> => {
    if (!supportsMediaDevices) {
      setDeviceList([]);
      setHasEnumeratedDevices(true);
      setError('Media device APIs are not available in this browser.');
      setErrorCode('media-devices-unsupported');
      setActiveDeviceIdState(null);
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const nextVideoDevices = devices.filter(
        (device: MediaDeviceInfo): boolean => device.kind === 'videoinput',
      );

      setDeviceList(nextVideoDevices);

      if (nextVideoDevices.length === 0) {
        setActiveDeviceIdState(null);
        setError('No camera device was found.');
        setErrorCode('no-camera');
      } else {
        setActiveDeviceIdState((currentDeviceId: string | null): string | null => {
          if (
            currentDeviceId !== null &&
            nextVideoDevices.some(
              (device: MediaDeviceInfo): boolean => device.deviceId === currentDeviceId,
            )
          ) {
            return currentDeviceId;
          }

          return nextVideoDevices[0]?.deviceId ?? null;
        });
      }
    } catch (deviceError: unknown) {
      const nextError = getCameraErrorDescriptor(deviceError);
      setDeviceList([]);
      setActiveDeviceIdState(null);
      setError(nextError.message);
      setErrorCode(nextError.code);
    } finally {
      setHasEnumeratedDevices(true);
    }
  }, [supportsMediaDevices]);

  const setActiveDeviceId = useCallback((nextDeviceId: string | null): void => {
    setActiveDeviceIdState(nextDeviceId);
  }, []);

  const setSelectedResolutionId = useCallback((nextResolutionId: string): void => {
    setSelectedResolutionIdState(nextResolutionId);
  }, []);

  const setSelectedFrameRate = useCallback((nextFrameRate: number | null): void => {
    setSelectedFrameRateState(nextFrameRate);
  }, []);

  const cycleCameraDevice = useCallback((): void => {
    if (deviceList.length <= 1) {
      return;
    }

    setActiveDeviceIdState((currentDeviceId: string | null): string | null => {
      const currentIndex = deviceList.findIndex(
        (device: MediaDeviceInfo): boolean => device.deviceId === currentDeviceId,
      );

      if (currentIndex === -1) {
        return deviceList[0]?.deviceId ?? null;
      }

      const nextIndex = (currentIndex + 1) % deviceList.length;
      return deviceList[nextIndex]?.deviceId ?? null;
    });
  }, [deviceList]);

  useEffect((): void => {
    if (
      selectedResolutionId !== 'auto' &&
      !resolutionOptions.some(
        (option: CameraResolutionOption): boolean => option.id === selectedResolutionId,
      )
    ) {
      setSelectedResolutionIdState('auto');
    }
  }, [resolutionOptions, selectedResolutionId]);

  useEffect((): void => {
    if (
      selectedFrameRate !== null &&
      frameRateOptions.length > 0 &&
      !frameRateOptions.includes(selectedFrameRate)
    ) {
      setSelectedFrameRateState(frameRateOptions[0] ?? null);
    }
  }, [frameRateOptions, selectedFrameRate]);

  useEffect((): (() => void) | void => {
    if (!supportsMediaDevices) {
      setError('Media device APIs are not available in this browser.');
      setErrorCode('media-devices-unsupported');
      setHasEnumeratedDevices(true);
      return undefined;
    }

    function handleDeviceChange(): void {
      void refreshDevices();
    }

    void refreshDevices();
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);

    return (): void => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [refreshDevices, supportsMediaDevices]);

  useEffect((): (() => void) | void => {
    if (!supportsMediaDevices || !hasEnumeratedDevices) {
      return undefined;
    }

    if (deviceList.length === 0) {
      setCameraCapabilities(null);
      setCurrentSettings(null);
      setStream((previousStream: MediaStream | null): MediaStream | null => {
        if (previousStream !== null) {
          stopMediaStream(previousStream);
        }

        return null;
      });

      if (videoRef.current !== null) {
        videoRef.current.srcObject = null;
      }

      return undefined;
    }

    let isCancelled = false;
    let nextStream: MediaStream | null = null;
    const attachedVideoElement = videoRef.current;

    async function startCamera(): Promise<void> {
      setError(null);
      setErrorCode(null);

      try {
        const constraints = buildCameraConstraints({
          activeDeviceId: activeDeviceIdState,
          selectedFrameRate,
          selectedResolution,
        });

        nextStream = await navigator.mediaDevices.getUserMedia(constraints);

        if (isCancelled) {
          stopMediaStream(nextStream);
          return;
        }

        const nextVideoTrack = nextStream.getVideoTracks()[0];
        const nextSettings = getCurrentCameraSettings(nextVideoTrack);
        const nextCapabilities = getCameraCapabilitySummary(nextVideoTrack);

        setCameraCapabilities(nextCapabilities);
        setCurrentSettings(nextSettings);
        setStream((previousStream: MediaStream | null): MediaStream => {
          if (previousStream !== null && previousStream !== nextStream) {
            stopMediaStream(previousStream);
          }

          return nextStream as MediaStream;
        });

        if (attachedVideoElement !== null) {
          attachedVideoElement.srcObject = nextStream;
          attachedVideoElement.muted = true;
          attachedVideoElement.playsInline = true;
          void attachedVideoElement.play().catch((): void => undefined);
        }

        if (activeDeviceIdState === null && nextSettings?.deviceId != null) {
          setActiveDeviceIdState((currentDeviceId: string | null): string | null =>
            currentDeviceId ?? nextSettings.deviceId ?? null,
          );
        }

        await refreshDevices();
      } catch (streamError: unknown) {
        if (isCancelled) {
          return;
        }

        stopMediaStream(nextStream);
        setCameraCapabilities(null);
        setCurrentSettings(null);
        setStream((previousStream: MediaStream | null): MediaStream | null => {
          if (previousStream !== null) {
            stopMediaStream(previousStream);
          }

          return null;
        });

        if (attachedVideoElement !== null) {
          attachedVideoElement.srcObject = null;
        }

        const nextError = getCameraErrorDescriptor(streamError);

        if (nextError.code === 'constraints-unsatisfied' && activeDeviceIdState !== null) {
          setError('Selected camera format is unavailable. Reverting to the default camera profile.');
          setErrorCode(nextError.code);
          setActiveDeviceIdState(null);
          setSelectedResolutionIdState('auto');
          setSelectedFrameRateState(null);
          void refreshDevices();
          return;
        }

        setError(nextError.message);
        setErrorCode(nextError.code);
      }
    }

    void startCamera();

    return (): void => {
      isCancelled = true;

      if (attachedVideoElement?.srcObject === nextStream) {
        attachedVideoElement.srcObject = null;
      }

      stopMediaStream(nextStream);
    };
  }, [
    activeDeviceIdState,
    deviceList.length,
    hasEnumeratedDevices,
    refreshDevices,
    selectedFrameRate,
    selectedResolution,
    supportsMediaDevices,
  ]);

  useEffect((): (() => void) | void => {
    if (!supportsMediaDevices) {
      void setLiveInputStream(null);
      return undefined;
    }

    let isCancelled = false;
    let nextInputStream: MediaStream | null = null;

    async function startLiveInputMetering(): Promise<void> {
      try {
        nextInputStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            autoGainControl: true,
            echoCancellation: true,
            noiseSuppression: true,
          },
          video: false,
        });

        if (isCancelled) {
          stopMediaStream(nextInputStream);
          return;
        }

        liveInputStreamRef.current = nextInputStream;
        await setLiveInputStream(nextInputStream);
      } catch {
        if (isCancelled) {
          return;
        }

        liveInputStreamRef.current = null;
        await setLiveInputStream(null);
      }
    }

    void startLiveInputMetering();

    return (): void => {
      isCancelled = true;
      void setLiveInputStream(null);
      stopMediaStream(nextInputStream);
      liveInputStreamRef.current = null;
    };
  }, [setLiveInputStream, supportsMediaDevices]);

  const contextValue = useMemo<CameraControllerContextValue>(
    (): CameraControllerContextValue => ({
      activeDeviceId: activeDeviceIdState,
      cameraCapabilities,
      currentSettings,
      cycleCameraDevice,
      deviceList,
      error,
      errorCode,
      frameRateOptions,
      refreshDevices,
      selectedFrameRate,
      selectedResolutionId,
      resolutionOptions,
      setActiveDeviceId,
      setSelectedFrameRate,
      setSelectedResolutionId,
      stream,
      videoRef,
    }),
    [
      activeDeviceIdState,
      cameraCapabilities,
      currentSettings,
      cycleCameraDevice,
      deviceList,
      error,
      errorCode,
      frameRateOptions,
      refreshDevices,
      selectedFrameRate,
      selectedResolutionId,
      resolutionOptions,
      setActiveDeviceId,
      setSelectedFrameRate,
      setSelectedResolutionId,
      stream,
    ],
  );

  return (
    <CameraControllerContext.Provider value={contextValue}>
      {children}
    </CameraControllerContext.Provider>
  );
}

export function useCameraController(): CameraControllerContextValue {
  const contextValue = useContext(CameraControllerContext);

  if (contextValue === null) {
    throw new Error('useCameraController must be used within a CameraController.');
  }

  return contextValue;
}
