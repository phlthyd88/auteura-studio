export type TimelineTrackType = 'audio' | 'video';
export type TimelineBlendMode = 'add' | 'multiply' | 'normal' | 'overlay' | 'screen';
export type TimelineTransitionType =
  | 'crossfade'
  | 'dip-to-black'
  | 'dip-to-white'
  | 'slide-left'
  | 'slide-right'
  | 'wipe-left-to-right'
  | 'wipe-right-to-left';
export type TimelineTransitionCurve = 'ease-in' | 'ease-in-out' | 'ease-out' | 'linear';
export type TimelineTransitionPlacement = 'in' | 'out';

export interface TimelineClipSourceAudioMetadata {
  readonly channelCount?: number;
  readonly hasAudio: boolean;
  readonly sampleRate?: number;
}

export interface TimelineClipSource {
  readonly audioMetadata: TimelineClipSourceAudioMetadata;
  readonly mediaId: string;
  readonly mediaType: 'image' | 'video';
  readonly name: string;
  readonly thumbnail?: string;
}

export interface TimelineClipTransform {
  readonly rotationDegrees: number;
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

export interface TimelineEnvelopePoint {
  readonly timeMs: number;
  readonly value: number;
}

export interface TimelineClipAudioSettings {
  readonly fadeInMs: number;
  readonly fadeOutMs: number;
  readonly gain: number;
  readonly muted: boolean;
  readonly pan: number;
  readonly panEnvelope: readonly TimelineEnvelopePoint[];
  readonly volumeEnvelope: readonly TimelineEnvelopePoint[];
}

export type TimelineClipEffectType =
  | 'blur'
  | 'crop'
  | 'sharpen'
  | 'transform-override'
  | 'vignette';

export interface TimelineClipEffectBase {
  readonly enabled: boolean;
  readonly id: string;
  readonly label: string;
  readonly type: TimelineClipEffectType;
}

export interface TimelineClipBlurEffect extends TimelineClipEffectBase {
  readonly radius: number;
  readonly type: 'blur';
}

export interface TimelineClipCropEffect extends TimelineClipEffectBase {
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly type: 'crop';
}

export interface TimelineClipSharpenEffect extends TimelineClipEffectBase {
  readonly amount: number;
  readonly type: 'sharpen';
}

export interface TimelineClipTransformOverrideEffect extends TimelineClipEffectBase {
  readonly transform: TimelineClipTransform;
  readonly type: 'transform-override';
}

export interface TimelineClipVignetteEffect extends TimelineClipEffectBase {
  readonly feather: number;
  readonly intensity: number;
  readonly roundness: number;
  readonly type: 'vignette';
}

export type TimelineClipEffect =
  | TimelineClipBlurEffect
  | TimelineClipCropEffect
  | TimelineClipSharpenEffect
  | TimelineClipTransformOverrideEffect
  | TimelineClipVignetteEffect;

export interface TimelineTransition {
  readonly curve: TimelineTransitionCurve;
  readonly durationMs: number;
  readonly id: string;
  readonly placement: TimelineTransitionPlacement;
  readonly type: TimelineTransitionType;
}

export interface TimelineClip {
  readonly audio: TimelineClipAudioSettings;
  readonly blendMode: TimelineBlendMode;
  readonly durationMs: number;
  readonly effects: readonly TimelineClipEffect[];
  readonly id: string;
  readonly label: string;
  readonly opacity: number;
  readonly source: TimelineClipSource;
  readonly startMs: number;
  readonly transform: TimelineClipTransform;
  readonly transitions: readonly TimelineTransition[];
  readonly trimEndMs: number;
  readonly trimStartMs: number;
}

export interface TimelineTrack {
  readonly clipIds: readonly string[];
  readonly id: string;
  readonly label: string;
  readonly locked: boolean;
  readonly muted: boolean;
  readonly solo: boolean;
  readonly type: TimelineTrackType;
}

export interface TimelineProject {
  readonly clipLookup: Readonly<Record<string, TimelineClip>>;
  readonly createdAt: number;
  readonly durationMs: number;
  readonly id: string;
  readonly name: string;
  readonly playheadMs: number;
  readonly selectedClipId: string | null;
  readonly selectedTrackId: string | null;
  readonly tracks: readonly TimelineTrack[];
  readonly updatedAt: number;
  readonly zoomLevel: number;
}

export interface TimelineProjectHistorySnapshot {
  readonly clipLookup: Readonly<Record<string, TimelineClip>>;
  readonly createdAt: number;
  readonly durationMs: number;
  readonly id: string;
  readonly name: string;
  readonly tracks: readonly TimelineTrack[];
  readonly updatedAt: number;
}

export interface TimelineHistoryState {
  readonly future: readonly TimelineProjectHistorySnapshot[];
  readonly past: readonly TimelineProjectHistorySnapshot[];
  readonly present: TimelineProject;
}

export interface TimelineProjectRecord {
  readonly createdAt: number;
  readonly id: string;
  readonly project: TimelineProject;
  readonly updatedAt: number;
}

export interface TimelineProjectListEntry {
  readonly createdAt: number;
  readonly id: string;
  readonly name: string;
  readonly updatedAt: number;
}

export interface TimelineResolvedTransition {
  readonly clipId: string;
  readonly progress: number;
  readonly trackId: string;
  readonly transition: TimelineTransition;
}

export interface TimelineVideoCompositionInstruction {
  readonly blendMode: TimelineBlendMode;
  readonly clipId: string;
  readonly clipOffsetMs: number;
  readonly durationMs: number;
  readonly kind: 'video-layer';
  readonly mediaId: string;
  readonly mediaType: TimelineClipSource['mediaType'];
  readonly opacity: number;
  readonly remainingMs: number;
  readonly sourceOffsetMs: number;
  readonly trackId: string;
  readonly trackIndex: number;
  readonly transform: TimelineClipTransform;
  readonly trimEndMs: number;
  readonly trimStartMs: number;
  readonly zIndex: number;
}

export interface TimelineAudioCompositionInstruction {
  readonly audioContextTimeSeconds: number | null;
  readonly clipId: string;
  readonly clipOffsetMs: number;
  readonly durationMs: number;
  readonly endTimeSeconds: number | null;
  readonly fadeInMs: number;
  readonly fadeOutMs: number;
  readonly gain: number;
  readonly kind: 'audio-node';
  readonly mediaId: string;
  readonly pan: number;
  readonly panEnvelope: readonly TimelineEnvelopePoint[];
  readonly sourceOffsetMs: number;
  readonly startTimeSeconds: number | null;
  readonly trackId: string;
  readonly trackIndex: number;
  readonly trackType: 'audio';
  readonly volumeEnvelope: readonly TimelineEnvelopePoint[];
}

export interface TimelineTransitionCompositionInstruction {
  readonly clipId: string;
  readonly kind: 'transition';
  readonly progress: number;
  readonly trackId: string;
  readonly transition: TimelineTransition;
}

export type TimelineCompositionInstruction =
  | TimelineAudioCompositionInstruction
  | TimelineTransitionCompositionInstruction
  | TimelineVideoCompositionInstruction;

export const defaultTimelineZoomLevel = 1;
export const defaultTimelineTrackState = {
  locked: false,
  muted: false,
  solo: false,
} as const;

export const defaultTimelineClipTransform: TimelineClipTransform = {
  rotationDegrees: 0,
  scale: 1,
  x: 0,
  y: 0,
};

export const defaultTimelineClipAudioSettings: TimelineClipAudioSettings = {
  fadeInMs: 0,
  fadeOutMs: 0,
  gain: 1,
  muted: false,
  pan: 0,
  panEnvelope: [],
  volumeEnvelope: [],
};

export const defaultTimelineClipEffects: readonly TimelineClipEffect[] = [];

export function createEmptyTimelineProject(name = 'Untitled Project'): TimelineProject {
  const now = Date.now();
  const defaultTrackId = crypto.randomUUID();

  return {
    clipLookup: {},
    createdAt: now,
    durationMs: 0,
    id: crypto.randomUUID(),
    name,
    playheadMs: 0,
    selectedClipId: null,
    selectedTrackId: defaultTrackId,
    tracks: [
      {
        clipIds: [],
        id: defaultTrackId,
        label: 'Video Track 1',
        locked: defaultTimelineTrackState.locked,
        muted: defaultTimelineTrackState.muted,
        solo: defaultTimelineTrackState.solo,
        type: 'video',
      },
    ],
    updatedAt: now,
    zoomLevel: defaultTimelineZoomLevel,
  };
}

export function hasSoloTimelineTrack(project: TimelineProject): boolean {
  return project.tracks.some((track: TimelineTrack): boolean => track.solo);
}

export function isTimelineTrackActive(
  project: TimelineProject,
  track: TimelineTrack,
): boolean {
  return hasSoloTimelineTrack(project) ? track.solo : !track.muted;
}

export function sortTrackClipsByStart(
  clipIds: readonly string[],
  clipLookup: Readonly<Record<string, TimelineClip>>,
): readonly string[] {
  return [...clipIds].sort((leftId: string, rightId: string): number => {
    const leftClip = clipLookup[leftId];
    const rightClip = clipLookup[rightId];

    if (leftClip === undefined || rightClip === undefined) {
      return leftId.localeCompare(rightId);
    }

    return leftClip.startMs - rightClip.startMs;
  });
}

export function calculateProjectDuration(project: TimelineProject): number {
  return project.tracks.reduce((maxDuration: number, track: TimelineTrack): number => {
    const trackDuration = track.clipIds.reduce((trackMax: number, clipId: string): number => {
      const clip = project.clipLookup[clipId];

      if (clip === undefined) {
        return trackMax;
      }

      return Math.max(trackMax, clip.startMs + clip.durationMs);
    }, 0);

    return Math.max(maxDuration, trackDuration);
  }, 0);
}

export function clampTimelinePlayhead(project: TimelineProject, playheadMs: number): number {
  return Math.min(Math.max(0, playheadMs), Math.max(project.durationMs, 0));
}
