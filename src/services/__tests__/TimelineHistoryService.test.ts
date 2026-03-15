import { describe, expect, it } from 'vitest';
import {
  createEmptyTimelineProject,
  defaultTimelineClipAudioSettings,
  defaultTimelineClipEffects,
  defaultTimelineClipTransform,
  type TimelineClip,
  type TimelineProject,
} from '../../models/Timeline';
import {
  areTimelineProjectsEquivalent,
  createTimelineHistorySnapshot,
  materializeTimelineProjectFromHistorySnapshot,
} from '../TimelineHistoryService';

function createProjectWithClip(): TimelineProject {
  const baseProject = createEmptyTimelineProject('History');
  const clipId = 'clip-1';
  const trackId = baseProject.tracks[0]!.id;
  const clip: TimelineClip = {
    audio: defaultTimelineClipAudioSettings,
    blendMode: 'normal',
    durationMs: 4_000,
    effects: defaultTimelineClipEffects,
    id: clipId,
    label: 'Clip',
    opacity: 1,
    source: {
      audioMetadata: {
        hasAudio: true,
      },
      mediaId: 'media-1',
      mediaType: 'video',
      name: 'Clip',
    },
    startMs: 0,
    transform: defaultTimelineClipTransform,
    transitions: [],
    trimEndMs: 4_000,
    trimStartMs: 0,
  };

  return {
    ...baseProject,
    clipLookup: {
      [clipId]: clip,
    },
    durationMs: 4_000,
    selectedClipId: clipId,
    selectedTrackId: trackId,
    tracks: baseProject.tracks.map((track) =>
      track.id === trackId
        ? {
            ...track,
            clipIds: [clipId],
          }
        : track,
    ),
  };
}

describe('TimelineHistoryService', (): void => {
  it('keeps volatile UI state out of history snapshots', (): void => {
    const project = createProjectWithClip();
    const snapshot = createTimelineHistorySnapshot(project);

    expect('playheadMs' in snapshot).toBe(false);
    expect('selectedClipId' in snapshot).toBe(false);
    expect('zoomLevel' in snapshot).toBe(false);
  });

  it('materializes snapshots while preserving current zoom and valid selection', (): void => {
    const currentProject = {
      ...createProjectWithClip(),
      playheadMs: 1_800,
      zoomLevel: 2.25,
    };
    const snapshot = createTimelineHistorySnapshot(currentProject);
    const restoredProject = materializeTimelineProjectFromHistorySnapshot(
      snapshot,
      currentProject,
    );

    expect(restoredProject.zoomLevel).toBe(2.25);
    expect(restoredProject.selectedClipId).toBe('clip-1');
    expect(restoredProject.playheadMs).toBe(1_800);
  });

  it('uses structural reference equality instead of deep JSON comparison', (): void => {
    const project = createProjectWithClip();
    const sameProject = project;
    const nextProject = {
      ...project,
      zoomLevel: 1.25,
    };

    expect(areTimelineProjectsEquivalent(project, sameProject)).toBe(true);
    expect(areTimelineProjectsEquivalent(project, nextProject)).toBe(false);
  });
});
