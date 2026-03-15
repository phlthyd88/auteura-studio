import { describe, expect, it } from 'vitest';
import {
  createEmptyTimelineProject,
  defaultTimelineClipAudioSettings,
  defaultTimelineClipEffects,
  defaultTimelineClipTransform,
  type TimelineProject,
} from '../../models/Timeline';
import {
  closeTrackGaps,
  duplicateClipWithRipple,
  insertGapAtPlayhead,
  rippleDeleteClip,
  splitClipAtPlayhead,
} from '../TimelineEditingService';

function buildProject(): TimelineProject {
  return {
    ...createEmptyTimelineProject(),
    clipLookup: {
      a: {
        durationMs: 2_000,
        id: 'a',
        label: 'Clip A',
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
          name: 'clip-a.webm',
        },
        startMs: 0,
        transform: defaultTimelineClipTransform,
        transitions: [],
        trimEndMs: 2_000,
        trimStartMs: 0,
      },
      b: {
        durationMs: 1_500,
        id: 'b',
        label: 'Clip B',
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
          name: 'clip-b.webm',
        },
        startMs: 3_000,
        transform: defaultTimelineClipTransform,
        transitions: [],
        trimEndMs: 1_500,
        trimStartMs: 0,
      },
    },
    selectedClipId: 'a',
    selectedTrackId: 'video-track-1',
    tracks: [
      {
        clipIds: ['a', 'b'],
        id: 'video-track-1',
        label: 'Video Track 1',
        locked: false,
        muted: false,
        solo: false,
        type: 'video',
      },
    ],
  };
}

describe('TimelineEditingService', (): void => {
  it('splits the selected clip at the playhead', (): void => {
    const project = buildProject();
    const nextProject = splitClipAtPlayhead(project, 'a', 1_000);

    expect(nextProject.tracks[0]?.clipIds).toHaveLength(3);
    expect(nextProject.clipLookup.a?.durationMs).toBe(1_000);
    expect(nextProject.selectedClipId).not.toBe('a');
  });

  it('duplicates a clip and ripples later clips forward', (): void => {
    const project = buildProject();
    const nextProject = duplicateClipWithRipple(project, 'a');
    const duplicatedClipId = nextProject.selectedClipId;

    expect(duplicatedClipId).not.toBeNull();
    expect(nextProject.clipLookup.b?.startMs).toBe(5_000);
    expect(
      duplicatedClipId === null ? null : nextProject.clipLookup[duplicatedClipId]?.startMs,
    ).toBe(2_000);
  });

  it('ripple deletes a clip and closes the following gap', (): void => {
    const project = buildProject();
    const nextProject = rippleDeleteClip(project, 'a');

    expect(nextProject.clipLookup.a).toBeUndefined();
    expect(nextProject.clipLookup.b?.startMs).toBe(1_000);
  });

  it('inserts and closes track gaps deterministically', (): void => {
    const project = buildProject();
    const withGap = insertGapAtPlayhead(project, 'video-track-1', 1_000, 500);
    const closed = closeTrackGaps(withGap, 'video-track-1');

    expect(withGap.clipLookup.b?.startMs).toBe(3_500);
    expect(closed.clipLookup.a?.startMs).toBe(0);
    expect(closed.clipLookup.b?.startMs).toBe(2_000);
  });
});
