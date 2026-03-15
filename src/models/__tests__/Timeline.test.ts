import { describe, expect, it } from 'vitest';
import {
  calculateProjectDuration,
  clampTimelinePlayhead,
  createEmptyTimelineProject,
  defaultTimelineClipAudioSettings,
  defaultTimelineClipEffects,
  defaultTimelineClipTransform,
  sortTrackClipsByStart,
  type TimelineProject,
} from '../Timeline';

describe('Timeline model helpers', (): void => {
  it('creates an empty project with a default selected video track', (): void => {
    const project = createEmptyTimelineProject('Session One');

    expect(project.name).toBe('Session One');
    expect(project.tracks).toHaveLength(1);
    expect(project.selectedTrackId).toBe(project.tracks[0]?.id ?? null);
    expect(project.durationMs).toBe(0);
  });

  it('sorts clips by start time and computes project duration', (): void => {
    const project: TimelineProject = {
      ...createEmptyTimelineProject(),
      clipLookup: {
        a: {
          durationMs: 2_000,
          id: 'a',
          label: 'A',
          audio: defaultTimelineClipAudioSettings,
          blendMode: 'normal',
          effects: defaultTimelineClipEffects,
          opacity: 1,
          source: {
            audioMetadata: {
              hasAudio: true,
            },
            mediaId: 'media-a',
            mediaType: 'video',
            name: 'A.webm',
          },
          startMs: 3_000,
          transform: defaultTimelineClipTransform,
          transitions: [],
          trimEndMs: 2_000,
          trimStartMs: 0,
        },
        b: {
          durationMs: 4_000,
          id: 'b',
          label: 'B',
          audio: defaultTimelineClipAudioSettings,
          blendMode: 'normal',
          effects: defaultTimelineClipEffects,
          opacity: 1,
          source: {
            audioMetadata: {
              hasAudio: true,
            },
            mediaId: 'media-b',
            mediaType: 'video',
            name: 'B.webm',
          },
          startMs: 500,
          transform: defaultTimelineClipTransform,
          transitions: [],
          trimEndMs: 4_000,
          trimStartMs: 0,
        },
      },
      tracks: [
        {
          clipIds: ['a', 'b'],
          id: 'track-a',
          label: 'Video Track 1',
          locked: false,
          muted: false,
          solo: false,
          type: 'video',
        },
      ],
    };

    expect(sortTrackClipsByStart(project.tracks[0]?.clipIds ?? [], project.clipLookup)).toEqual([
      'b',
      'a',
    ]);
    expect(calculateProjectDuration(project)).toBe(5_000);
  });

  it('clamps the playhead to the project duration', (): void => {
    const project = {
      ...createEmptyTimelineProject(),
      durationMs: 4_500,
    };

    expect(clampTimelinePlayhead(project, -100)).toBe(0);
    expect(clampTimelinePlayhead(project, 1_500)).toBe(1_500);
    expect(clampTimelinePlayhead(project, 9_000)).toBe(4_500);
  });
});
