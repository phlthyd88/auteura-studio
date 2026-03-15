import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import {
  AudioMeterService,
  type AudioMeterCollectionSnapshot,
} from '../services/AudioMeterService';

const defaultAudioMeters: AudioMeterCollectionSnapshot = {
  liveInput: {
    active: false,
    channelCount: 2,
    channels: [
      { peak: 0, peakDbfs: null, rms: 0, rmsDbfs: null },
      { peak: 0, peakDbfs: null, rms: 0, rmsDbfs: null },
    ],
    peak: 0,
    peakDbfs: null,
    rms: 0,
    rmsDbfs: null,
  },
  timelinePlayback: {
    active: false,
    channelCount: 2,
    channels: [
      { peak: 0, peakDbfs: null, rms: 0, rmsDbfs: null },
      { peak: 0, peakDbfs: null, rms: 0, rmsDbfs: null },
    ],
    peak: 0,
    peakDbfs: null,
    rms: 0,
    rmsDbfs: null,
  },
};

export interface AudioContextValue {
  readonly audioContext: AudioContext | null;
  readonly audioMeters: AudioMeterCollectionSnapshot;
  readonly destinationNode: MediaStreamAudioDestinationNode | null;
  readonly destinationStream: MediaStream | null;
  readonly timelineOutputNode: GainNode | null;
  ensureAudioContext: () => Promise<AudioContext | null>;
  releaseLiveInputStream: (ownerId: string) => Promise<void>;
  requestLiveInputStream: (ownerId: string) => Promise<boolean>;
}

const AudioContextState = createContext<AudioContextValue | null>(null);

function stopMediaStream(stream: MediaStream | null): void {
  if (stream === null) {
    return;
  }

  stream.getTracks().forEach((track: MediaStreamTrack): void => {
    track.stop();
  });
}

export function AudioProvider({ children }: PropsWithChildren): JSX.Element {
  const audioContextRef = useRef<AudioContext | null>(null);
  const destinationNodeRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const meterServiceRef = useRef<AudioMeterService | null>(null);
  const liveInputStreamRef = useRef<MediaStream | null>(null);
  const liveInputOwnersRef = useRef<Set<string>>(new Set<string>());
  const liveInputSyncRef = useRef<Promise<boolean>>(Promise.resolve(false));
  const [audioContextState, setAudioContextState] = useState<AudioContext | null>(null);
  const [audioMeters, setAudioMeters] = useState<AudioMeterCollectionSnapshot>(defaultAudioMeters);
  const [destinationStreamState, setDestinationStreamState] = useState<MediaStream | null>(null);
  const [timelineOutputNodeState, setTimelineOutputNodeState] = useState<GainNode | null>(null);

  const ensureAudioContext = useCallback(async (): Promise<AudioContext | null> => {
    if (audioContextRef.current !== null) {
      if (audioContextRef.current.state === 'suspended') {
        return audioContextRef.current
          .resume()
          .then((): AudioContext => audioContextRef.current as AudioContext)
          .catch((): AudioContext => audioContextRef.current as AudioContext);
      }

      return audioContextRef.current;
    }

    if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') {
      return null;
    }

    const nextAudioContext = new window.AudioContext();
    const destinationNode = nextAudioContext.createMediaStreamDestination();
    const meterService = new AudioMeterService(nextAudioContext, destinationNode);
    audioContextRef.current = nextAudioContext;
    destinationNodeRef.current = destinationNode;
    meterServiceRef.current = meterService;
    setAudioContextState(nextAudioContext);
    setTimelineOutputNodeState(meterService.timelineOutputNode);
    setDestinationStreamState(destinationNode.stream);
    meterService.setLiveInputStream(liveInputStreamRef.current);
    setAudioMeters(meterService.createSnapshot());
    return nextAudioContext;
  }, []);

  const applyLiveInputStream = useCallback(
    async (stream: MediaStream | null): Promise<void> => {
      liveInputStreamRef.current = stream;

      if (stream === null && meterServiceRef.current === null) {
        setAudioMeters(defaultAudioMeters);
        return;
      }

      const nextAudioContext = await ensureAudioContext();

      if (nextAudioContext === null) {
        setAudioMeters(defaultAudioMeters);
        return;
      }

      meterServiceRef.current?.setLiveInputStream(stream);
      setAudioMeters(
        meterServiceRef.current?.createSnapshot() ?? defaultAudioMeters,
      );
    },
    [ensureAudioContext],
  );

  const syncLiveInputStream = useCallback(async (): Promise<boolean> => {
    if (liveInputOwnersRef.current.size === 0) {
      const currentLiveInputStream = liveInputStreamRef.current;
      await applyLiveInputStream(null);
      stopMediaStream(currentLiveInputStream);
      liveInputStreamRef.current = null;
      return false;
    }

    const currentLiveInputStream = liveInputStreamRef.current;
    const hasLiveAudioTrack = currentLiveInputStream?.getAudioTracks().some(
      (track: MediaStreamTrack): boolean => track.readyState === 'live',
    );

    if (hasLiveAudioTrack) {
      await applyLiveInputStream(currentLiveInputStream);
      return true;
    }

    if (
      typeof navigator === 'undefined' ||
      typeof navigator.mediaDevices === 'undefined' ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      await applyLiveInputStream(null);
      return false;
    }

    try {
      const nextLiveInputStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      });

      if (liveInputOwnersRef.current.size === 0) {
        stopMediaStream(nextLiveInputStream);
        await applyLiveInputStream(null);
        return false;
      }

      stopMediaStream(currentLiveInputStream);
      await applyLiveInputStream(nextLiveInputStream);
      return true;
    } catch {
      stopMediaStream(currentLiveInputStream);
      await applyLiveInputStream(null);
      return false;
    }
  }, [applyLiveInputStream]);

  const queueLiveInputSync = useCallback(async (): Promise<boolean> => {
    liveInputSyncRef.current = liveInputSyncRef.current
      .catch((): boolean => false)
      .then(async (): Promise<boolean> => syncLiveInputStream());

    return liveInputSyncRef.current;
  }, [syncLiveInputStream]);

  const requestLiveInputStream = useCallback(
    async (ownerId: string): Promise<boolean> => {
      liveInputOwnersRef.current.add(ownerId);
      return queueLiveInputSync();
    },
    [queueLiveInputSync],
  );

  const releaseLiveInputStream = useCallback(
    async (ownerId: string): Promise<void> => {
      liveInputOwnersRef.current.delete(ownerId);
      await queueLiveInputSync();
    },
    [queueLiveInputSync],
  );

  useEffect((): (() => void) | void => {
    let meterTimerId: number | null = null;

    function sampleMeters(): void {
      setAudioMeters(
        meterServiceRef.current?.createSnapshot() ?? defaultAudioMeters,
      );
    }

    if (audioContextState !== null) {
      sampleMeters();
      meterTimerId = window.setInterval(sampleMeters, 120);
    }

    return (): void => {
      if (meterTimerId !== null) {
        window.clearInterval(meterTimerId);
      }
    };
  }, [audioContextState]);

  useEffect((): (() => void) => {
    const liveInputOwners = liveInputOwnersRef.current;

    return (): void => {
      const currentAudioContext = audioContextRef.current;

      meterServiceRef.current?.dispose();
      meterServiceRef.current = null;

      if (currentAudioContext !== null && currentAudioContext.state !== 'closed') {
        void currentAudioContext.close().catch((): void => undefined);
      }

      destinationNodeRef.current = null;
      liveInputOwners.clear();
      stopMediaStream(liveInputStreamRef.current);
      liveInputStreamRef.current = null;
    };
  }, []);

  const contextValue = useMemo<AudioContextValue>(
    (): AudioContextValue => ({
      audioContext: audioContextState,
      audioMeters,
      destinationNode: destinationNodeRef.current,
      destinationStream: destinationStreamState,
      ensureAudioContext,
      releaseLiveInputStream,
      requestLiveInputStream,
      timelineOutputNode: timelineOutputNodeState,
    }),
    [
      audioContextState,
      audioMeters,
      destinationStreamState,
      ensureAudioContext,
      releaseLiveInputStream,
      requestLiveInputStream,
      timelineOutputNodeState,
    ],
  );

  return <AudioContextState.Provider value={contextValue}>{children}</AudioContextState.Provider>;
}

export function useAudioContext(): AudioContextValue {
  const contextValue = useContext(AudioContextState);

  if (contextValue === null) {
    throw new Error('useAudioContext must be used within an AudioProvider.');
  }

  return contextValue;
}
