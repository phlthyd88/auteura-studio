import type {
  TimelineAudioCompositionInstruction,
  TimelineClip,
  TimelineProject,
  TimelineResolvedTransition,
  TimelineTrack,
  TimelineTransition,
} from '../models/Timeline';
import { isTimelineTrackActive } from '../models/Timeline';
import type {
  TimelineCompositionInstruction,
  TimelineCompositionTransition,
  TimelineCompositionVisualLayer,
} from '../types/compositor';

export type TimelineCompositionSnapshot = TimelineCompositionInstruction;

export interface TimelineCompositionOptions {
  readonly exportMode: boolean;
  readonly isPlaying: boolean;
  readonly qualityScale: number;
}

const defaultFrameDurationMs = 1000 / 60;

function getClipEndMs(clip: TimelineClip): number {
  return clip.startMs + clip.durationMs;
}

function applyTransitionCurve(progress: number, curve: TimelineTransition['curve']): number {
  const clampedProgress = Math.max(0, Math.min(1, progress));

  switch (curve) {
    case 'ease-in':
      return clampedProgress * clampedProgress;
    case 'ease-out':
      return 1 - ((1 - clampedProgress) * (1 - clampedProgress));
    case 'ease-in-out':
      return clampedProgress < 0.5
        ? 2 * clampedProgress * clampedProgress
        : 1 - (Math.pow(-2 * clampedProgress + 2, 2) / 2);
    case 'linear':
    default:
      return clampedProgress;
  }
}

function createVideoLayerInstruction(
  clip: TimelineClip,
  track: TimelineTrack,
  trackIndex: number,
  playheadMs: number,
): TimelineCompositionVisualLayer | null {
  const clipEndMs = getClipEndMs(clip);

  if (playheadMs < clip.startMs || playheadMs >= clipEndMs) {
    return null;
  }

  const clipOffsetMs = Math.max(0, playheadMs - clip.startMs);

  return {
    blendMode: clip.blendMode,
    clipId: clip.id,
    clipOffsetMs,
    effects: clip.effects,
    mediaType: clip.source.mediaType,
    opacity: clip.opacity,
    remainingMs: Math.max(0, clipEndMs - playheadMs),
    sourceId: clip.source.mediaId,
    sourceOffsetMs: clip.trimStartMs + clipOffsetMs,
    trackId: track.id,
    trackIndex,
    transform: clip.transform,
    zIndex: trackIndex,
  };
}

function createAudioInstruction(
  clip: TimelineClip,
  track: TimelineTrack,
  trackIndex: number,
  playheadMs: number,
  audioContextTimeSeconds: number | null,
): TimelineAudioCompositionInstruction | null {
  const clipEndMs = getClipEndMs(clip);

  if (
    track.type !== 'audio' ||
    !clip.source.audioMetadata.hasAudio ||
    clip.audio.muted ||
    playheadMs < clip.startMs ||
    playheadMs >= clipEndMs
  ) {
    return null;
  }

  const clipOffsetMs = Math.max(0, playheadMs - clip.startMs);

  return {
    audioContextTimeSeconds,
    clipId: clip.id,
    clipOffsetMs,
    durationMs: clip.durationMs,
    endTimeSeconds:
      audioContextTimeSeconds === null
        ? null
        : audioContextTimeSeconds + (clipEndMs - playheadMs) / 1000,
    fadeInMs: clip.audio.fadeInMs,
    fadeOutMs: clip.audio.fadeOutMs,
    gain: clip.audio.gain,
    kind: 'audio-node',
    mediaId: clip.source.mediaId,
    pan: clip.audio.pan,
    panEnvelope: clip.audio.panEnvelope,
    sourceOffsetMs: clip.trimStartMs + clipOffsetMs,
    startTimeSeconds: audioContextTimeSeconds,
    trackId: track.id,
    trackIndex,
    trackType: 'audio',
    volumeEnvelope: clip.audio.volumeEnvelope,
  };
}

function createPlaybackAudioInstruction(
  clip: TimelineClip,
  track: TimelineTrack,
  trackIndex: number,
  initialPlayheadMs: number,
  startAtSeconds: number | null,
): TimelineAudioCompositionInstruction | null {
  const clipEndMs = getClipEndMs(clip);

  if (
    track.type !== 'audio' ||
    !clip.source.audioMetadata.hasAudio ||
    clip.audio.muted ||
    clipEndMs <= initialPlayheadMs
  ) {
    return null;
  }

  const clipOffsetMs = Math.max(0, initialPlayheadMs - clip.startMs);
  const remainingMs = Math.max(0, clip.durationMs - clipOffsetMs);

  if (remainingMs <= 0) {
    return null;
  }

  const startTimeSeconds =
    startAtSeconds === null
      ? null
      : startAtSeconds + Math.max(0, clip.startMs - initialPlayheadMs) / 1000;

  return {
    audioContextTimeSeconds: startAtSeconds,
    clipId: clip.id,
    clipOffsetMs,
    durationMs: remainingMs,
    endTimeSeconds:
      startTimeSeconds === null ? null : startTimeSeconds + remainingMs / 1000,
    fadeInMs: clip.audio.fadeInMs,
    fadeOutMs: clip.audio.fadeOutMs,
    gain: clip.audio.gain,
    kind: 'audio-node',
    mediaId: clip.source.mediaId,
    pan: clip.audio.pan,
    panEnvelope: clip.audio.panEnvelope,
    sourceOffsetMs: clip.trimStartMs + clipOffsetMs,
    startTimeSeconds,
    trackId: track.id,
    trackIndex,
    trackType: 'audio',
    volumeEnvelope: clip.audio.volumeEnvelope,
  };
}

function resolveNeighborSourceId(
  project: TimelineProject,
  track: TimelineTrack,
  clipId: string,
  direction: 'next' | 'previous',
): string | null {
  return resolveNeighborClip(project, track, clipId, direction)?.source.mediaId ?? null;
}

function resolveNeighborClip(
  project: TimelineProject,
  track: TimelineTrack,
  clipId: string,
  direction: 'next' | 'previous',
): TimelineClip | null {
  const clipIndex = track.clipIds.indexOf(clipId);

  if (clipIndex === -1) {
    return null;
  }

  const neighborIndex = direction === 'previous' ? clipIndex - 1 : clipIndex + 1;
  const neighborClipId = track.clipIds[neighborIndex];

  if (neighborClipId === undefined) {
    return null;
  }

  return project.clipLookup[neighborClipId] ?? null;
}

function resolveTransitionInstructions(
  project: TimelineProject,
  clip: TimelineClip,
  track: TimelineTrack,
  playheadMs: number,
): readonly TimelineCompositionTransition[] {
  return clip.transitions.flatMap(
    (transition: TimelineTransition): readonly TimelineCompositionTransition[] => {
      const transitionStartMs =
        transition.placement === 'in'
          ? clip.startMs
          : Math.max(clip.startMs, getClipEndMs(clip) - transition.durationMs);
      const transitionEndMs =
        transition.placement === 'in'
          ? Math.min(getClipEndMs(clip), clip.startMs + transition.durationMs)
          : getClipEndMs(clip);

      if (
        playheadMs < transitionStartMs ||
        playheadMs >= transitionEndMs ||
        transition.durationMs <= 0
      ) {
        return [];
      }

      const progress = (playheadMs - transitionStartMs) / transition.durationMs;

      return [
        {
          clipId: clip.id,
          curve: transition.curve,
          durationMs: transition.durationMs,
          placement: transition.placement,
          progress: applyTransitionCurve(progress, transition.curve),
          sourceA:
            transition.placement === 'in'
              ? resolveNeighborClip(project, track, clip.id, 'previous')?.source.mediaId ?? null
              : clip.source.mediaId,
          sourceAOffsetMs:
            transition.placement === 'in'
              ? ((): number | null => {
                  const neighborClip = resolveNeighborClip(project, track, clip.id, 'previous');

                  if (neighborClip === null) {
                    return null;
                  }

                  return Math.max(
                    0,
                    neighborClip.trimStartMs + (playheadMs - neighborClip.startMs),
                  );
                })()
              : Math.max(0, clip.trimStartMs + (playheadMs - clip.startMs)),
          sourceB:
            transition.placement === 'in'
              ? clip.source.mediaId
              : resolveNeighborSourceId(project, track, clip.id, 'next') ?? clip.source.mediaId,
          sourceBOffsetMs:
            transition.placement === 'in'
              ? Math.max(0, clip.trimStartMs + (playheadMs - clip.startMs))
              : ((): number => {
                  const neighborClip = resolveNeighborClip(project, track, clip.id, 'next');

                  if (neighborClip === null) {
                    return Math.max(0, clip.trimStartMs + (playheadMs - clip.startMs));
                  }

                  return Math.max(
                    0,
                    neighborClip.trimStartMs + (playheadMs - neighborClip.startMs),
                  );
                })(),
          trackId: track.id,
          transitionId: transition.id,
          type: transition.type,
        },
      ];
    },
  );
}

function resolveTrackInstructions(
  project: TimelineProject,
  track: TimelineTrack,
  trackIndex: number,
  playheadMs: number,
  audioContextTimeSeconds: number | null,
): {
  readonly audioNodes: readonly TimelineAudioCompositionInstruction[];
  readonly layers: readonly TimelineCompositionVisualLayer[];
  readonly transitions: readonly TimelineCompositionTransition[];
} {
  const layers: TimelineCompositionVisualLayer[] = [];
  const audioNodes: TimelineAudioCompositionInstruction[] = [];
  const transitions: TimelineCompositionTransition[] = [];

  for (const clipId of track.clipIds) {
    const clip = project.clipLookup[clipId];

    if (clip === undefined) {
      continue;
    }

    const layer = createVideoLayerInstruction(clip, track, trackIndex, playheadMs);

    if (layer !== null && track.type === 'video') {
      layers.push(layer);
    }

    const audioNode = createAudioInstruction(
      clip,
      track,
      trackIndex,
      playheadMs,
      audioContextTimeSeconds,
    );

    if (audioNode !== null) {
      audioNodes.push(audioNode);
    }

    transitions.push(...resolveTransitionInstructions(project, clip, track, playheadMs));
  }

  return {
    audioNodes,
    layers,
    transitions,
  };
}

export function composeTimelineInstructions(
  project: TimelineProject,
  playheadMs: number,
  audioContextTimeSeconds: number | null,
  options: TimelineCompositionOptions = {
    exportMode: false,
    isPlaying: false,
    qualityScale: 1,
  },
): TimelineCompositionSnapshot {
  const layers: TimelineCompositionVisualLayer[] = [];
  const audioNodes: TimelineAudioCompositionInstruction[] = [];
  const transitions: TimelineCompositionTransition[] = [];

  project.tracks.forEach((track: TimelineTrack, trackIndex: number): void => {
    if (!isTimelineTrackActive(project, track)) {
      return;
    }

    const trackInstructions = resolveTrackInstructions(
      project,
      track,
      trackIndex,
      playheadMs,
      audioContextTimeSeconds,
    );
    layers.push(...trackInstructions.layers);
    audioNodes.push(...trackInstructions.audioNodes);
    transitions.push(...trackInstructions.transitions);
  });

  return {
    audioNodes,
    layers: [...layers].sort(
      (left: TimelineCompositionVisualLayer, right: TimelineCompositionVisualLayer): number =>
        left.zIndex - right.zIndex,
    ),
    metadata: {
      audioContextTimeSeconds,
      frameDurationMs: defaultFrameDurationMs,
      isPlaying: options.isPlaying,
      playheadMs,
    },
    policy: {
      exportMode: options.exportMode,
      previewQualityScale: options.qualityScale,
    },
    transitions,
  };
}

export function resolveActiveTransitions(
  project: TimelineProject,
  playheadMs: number,
): readonly TimelineResolvedTransition[] {
  return project.tracks.flatMap((track: TimelineTrack): readonly TimelineResolvedTransition[] => {
    if (!isTimelineTrackActive(project, track)) {
      return [];
    }

    return track.clipIds.flatMap((clipId: string): readonly TimelineResolvedTransition[] => {
      const clip = project.clipLookup[clipId];

      if (clip === undefined) {
        return [];
      }

      return resolveTransitionInstructions(project, clip, track, playheadMs).map(
        (transitionInstruction: TimelineCompositionTransition): TimelineResolvedTransition => ({
          clipId: clip.id,
          progress: transitionInstruction.progress,
          trackId: track.id,
          transition: {
            curve: transitionInstruction.curve,
            durationMs: transitionInstruction.durationMs,
            id: transitionInstruction.transitionId,
            placement: transitionInstruction.placement,
            type: transitionInstruction.type,
          },
        }),
      );
    });
  });
}

export function composeTimelinePlaybackAudioInstructions(
  project: TimelineProject,
  initialPlayheadMs: number,
  startAtSeconds: number | null,
): readonly TimelineAudioCompositionInstruction[] {
  const audioNodes: TimelineAudioCompositionInstruction[] = [];

  project.tracks.forEach((track: TimelineTrack, trackIndex: number): void => {
    if (!isTimelineTrackActive(project, track)) {
      return;
    }

    track.clipIds.forEach((clipId: string): void => {
      const clip = project.clipLookup[clipId];

      if (clip === undefined) {
        return;
      }

      const audioInstruction = createPlaybackAudioInstruction(
        clip,
        track,
        trackIndex,
        initialPlayheadMs,
        startAtSeconds,
      );

      if (audioInstruction !== null) {
        audioNodes.push(audioInstruction);
      }
    });
  });

  return audioNodes.sort(
    (
      leftInstruction: TimelineAudioCompositionInstruction,
      rightInstruction: TimelineAudioCompositionInstruction,
    ): number => {
      const leftStartTimeSeconds = leftInstruction.startTimeSeconds ?? 0;
      const rightStartTimeSeconds = rightInstruction.startTimeSeconds ?? 0;

      if (leftStartTimeSeconds !== rightStartTimeSeconds) {
        return leftStartTimeSeconds - rightStartTimeSeconds;
      }

      return leftInstruction.trackIndex - rightInstruction.trackIndex;
    },
  );
}
