export type TimelineTransportClockSource = 'audio-master' | 'system-fallback';

export interface TimelineTransportSession {
  readonly clockSource: TimelineTransportClockSource;
  getCurrentTimeMs: () => number;
  stop: () => void;
}

interface TransportClockOptions {
  readonly anchorSeconds?: number;
  readonly initialPlayheadMs: number;
}

export function createAudioMasterTransportSession(
  audioContext: AudioContext,
  options: TransportClockOptions,
): TimelineTransportSession {
  const anchorSeconds = options.anchorSeconds ?? audioContext.currentTime;

  return {
    clockSource: 'audio-master',
    getCurrentTimeMs: (): number =>
      options.initialPlayheadMs + Math.max(0, audioContext.currentTime - anchorSeconds) * 1000,
    stop: (): void => undefined,
  };
}

export function createFallbackTransportSession(
  options: TransportClockOptions,
): TimelineTransportSession {
  const anchorMilliseconds = performance.now();

  return {
    clockSource: 'system-fallback',
    getCurrentTimeMs: (): number =>
      options.initialPlayheadMs + Math.max(0, performance.now() - anchorMilliseconds),
    stop: (): void => undefined,
  };
}
