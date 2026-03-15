import {
  clampTimelinePlayhead,
  type TimelineHistoryState,
  type TimelineProject,
  type TimelineProjectHistorySnapshot,
  type TimelineTrack,
} from '../models/Timeline';

export function createTimelineHistorySnapshot(
  project: TimelineProject,
): TimelineProjectHistorySnapshot {
  return {
    clipLookup: project.clipLookup,
    createdAt: project.createdAt,
    durationMs: project.durationMs,
    id: project.id,
    name: project.name,
    tracks: project.tracks,
    updatedAt: project.updatedAt,
  };
}

export function materializeTimelineProjectFromHistorySnapshot(
  snapshot: TimelineProjectHistorySnapshot,
  currentProject: TimelineProject,
): TimelineProject {
  const nextSelectedClipId =
    currentProject.selectedClipId !== null &&
    snapshot.clipLookup[currentProject.selectedClipId] !== undefined
      ? currentProject.selectedClipId
      : null;
  const nextSelectedTrackId =
    currentProject.selectedTrackId !== null &&
    snapshot.tracks.some(
      (track: TimelineTrack): boolean => track.id === currentProject.selectedTrackId,
    )
      ? currentProject.selectedTrackId
      : (snapshot.tracks[0]?.id ?? null);
  const nextPlayheadMs = clampTimelinePlayhead(
    {
      ...currentProject,
      clipLookup: snapshot.clipLookup,
      durationMs: snapshot.durationMs,
      tracks: snapshot.tracks,
    },
    currentProject.playheadMs,
  );

  return {
    clipLookup: snapshot.clipLookup,
    createdAt: snapshot.createdAt,
    durationMs: snapshot.durationMs,
    id: snapshot.id,
    name: snapshot.name,
    playheadMs: nextPlayheadMs,
    selectedClipId: nextSelectedClipId,
    selectedTrackId: nextSelectedTrackId,
    tracks: snapshot.tracks,
    updatedAt: snapshot.updatedAt,
    zoomLevel: currentProject.zoomLevel,
  };
}

export function areTimelineProjectsEquivalent(
  left: TimelineProject,
  right: TimelineProject,
): boolean {
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.createdAt === right.createdAt &&
    left.durationMs === right.durationMs &&
    left.playheadMs === right.playheadMs &&
    left.selectedClipId === right.selectedClipId &&
    left.selectedTrackId === right.selectedTrackId &&
    left.zoomLevel === right.zoomLevel &&
    left.clipLookup === right.clipLookup &&
    left.tracks === right.tracks
  );
}

export function pushTimelineHistoryState(
  currentState: TimelineHistoryState,
  nextProject: TimelineProject,
  historyLimit: number,
): TimelineHistoryState {
  const nextPast = [
    ...currentState.past,
    createTimelineHistorySnapshot(currentState.present),
  ].slice(-historyLimit);

  return {
    future: [],
    past: nextPast,
    present: nextProject,
  };
}
