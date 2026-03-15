import { useSyncExternalStore } from 'react';
import type { MediaItem } from './MediaStorageService';
import type { TimelineCompositionFrame } from './TimelineCompositor';

export type TimelinePreviewMode = 'live' | 'timeline';
export type TimelinePreviewStatus = 'idle' | 'loading' | 'missing-clip' | 'missing-media' | 'ready';

export interface TimelinePreviewSource {
  readonly clipId: string;
  readonly mediaItem: MediaItem;
  readonly sourceId: string;
  readonly sourceOffsetMs: number;
  readonly sourceUrl: string;
}

export interface TimelinePreviewState {
  readonly activeClipId: string | null;
  readonly activeSources: Readonly<Record<string, TimelinePreviewSource>>;
  readonly clipOffsetMs: number;
  readonly composition: TimelineCompositionFrame | null;
  readonly isPlaying: boolean;
  readonly mode: TimelinePreviewMode;
  readonly status: TimelinePreviewStatus;
}

const defaultTimelinePreviewState: TimelinePreviewState = {
  activeClipId: null,
  activeSources: {},
  clipOffsetMs: 0,
  composition: null,
  isPlaying: false,
  mode: 'live',
  status: 'idle',
};

let currentState: TimelinePreviewState = defaultTimelinePreviewState;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener: () => void): void => {
    listener();
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return (): void => {
    listeners.delete(listener);
  };
}

export function subscribeToTimelinePreviewState(listener: () => void): () => void {
  return subscribe(listener);
}

export function getTimelinePreviewState(): TimelinePreviewState {
  return currentState;
}

export function setTimelinePreviewState(nextState: TimelinePreviewState): void {
  currentState = nextState;
  emit();
}

export function useTimelinePreviewState(): TimelinePreviewState {
  return useSyncExternalStore(subscribe, getTimelinePreviewState, getTimelinePreviewState);
}
