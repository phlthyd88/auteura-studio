import {
  sortTrackClipsByStart,
  type TimelineClip,
  type TimelineProject,
  type TimelineTrack,
} from '../models/Timeline';

const minimumTimelineClipDurationMs = 500;
const defaultInsertedGapMs = 1_000;

interface TimelineClipOwner {
  readonly clip: TimelineClip;
  readonly track: TimelineTrack;
}

function getClipEndMs(clip: TimelineClip): number {
  return clip.startMs + clip.durationMs;
}

function getClipOwner(project: TimelineProject, clipId: string): TimelineClipOwner | null {
  const clip = project.clipLookup[clipId];

  if (clip === undefined) {
    return null;
  }

  const track = project.tracks.find((candidateTrack: TimelineTrack): boolean =>
    candidateTrack.clipIds.includes(clipId),
  );

  if (track === undefined) {
    return null;
  }

  return {
    clip,
    track,
  };
}

function replaceTrack(
  project: TimelineProject,
  trackId: string,
  updater: (track: TimelineTrack) => TimelineTrack,
): readonly TimelineTrack[] {
  return project.tracks.map((track: TimelineTrack): TimelineTrack =>
    track.id === trackId ? updater(track) : track,
  );
}

function shiftTrackClipsFromStart(
  project: TimelineProject,
  trackId: string,
  startingAtMs: number,
  deltaMs: number,
  excludedClipIds: readonly string[] = [],
): TimelineProject {
  const excludedClipIdSet = new Set(excludedClipIds);
  const nextClipLookup: Record<string, TimelineClip> = { ...project.clipLookup };

  for (const track of project.tracks) {
    if (track.id !== trackId) {
      continue;
    }

    for (const clipId of track.clipIds) {
      const clip = nextClipLookup[clipId];

      if (clip === undefined || excludedClipIdSet.has(clipId) || clip.startMs < startingAtMs) {
        continue;
      }

      nextClipLookup[clipId] = {
        ...clip,
        startMs: Math.max(0, clip.startMs + deltaMs),
      };
    }
  }

  return {
    ...project,
    clipLookup: nextClipLookup,
    tracks: replaceTrack(project, trackId, (track: TimelineTrack): TimelineTrack => ({
      ...track,
      clipIds: sortTrackClipsByStart(track.clipIds, nextClipLookup),
    })),
  };
}

export function splitClipAtPlayhead(
  project: TimelineProject,
  clipId: string,
  playheadMs: number,
): TimelineProject {
  const clipOwner = getClipOwner(project, clipId);

  if (clipOwner === null) {
    return project;
  }

  const splitOffsetMs = playheadMs - clipOwner.clip.startMs;

  if (
    splitOffsetMs < minimumTimelineClipDurationMs ||
    clipOwner.clip.durationMs - splitOffsetMs < minimumTimelineClipDurationMs
  ) {
    return project;
  }

  const trailingClipId = crypto.randomUUID();
  const leadingDurationMs = splitOffsetMs;
  const trailingDurationMs = clipOwner.clip.durationMs - splitOffsetMs;
  const trailingClip: TimelineClip = {
    ...clipOwner.clip,
    durationMs: trailingDurationMs,
    id: trailingClipId,
    label: `${clipOwner.clip.label} B`,
    startMs: playheadMs,
    transitions: [],
    trimEndMs: clipOwner.clip.trimEndMs,
    trimStartMs: clipOwner.clip.trimStartMs + leadingDurationMs,
  };
  const updatedLeadingClip: TimelineClip = {
    ...clipOwner.clip,
    durationMs: leadingDurationMs,
    transitions: [],
    trimEndMs: clipOwner.clip.trimStartMs + leadingDurationMs,
  };
  const nextClipLookup: Record<string, TimelineClip> = {
    ...project.clipLookup,
    [clipId]: updatedLeadingClip,
    [trailingClipId]: trailingClip,
  };

  return {
    ...project,
    clipLookup: nextClipLookup,
    selectedClipId: trailingClipId,
    tracks: replaceTrack(project, clipOwner.track.id, (track: TimelineTrack): TimelineTrack => ({
      ...track,
      clipIds: sortTrackClipsByStart([...track.clipIds, trailingClipId], nextClipLookup),
    })),
  };
}

export function duplicateClipWithRipple(
  project: TimelineProject,
  clipId: string,
): TimelineProject {
  const clipOwner = getClipOwner(project, clipId);

  if (clipOwner === null) {
    return project;
  }

  const duplicateClipId = crypto.randomUUID();
  const insertionPointMs = getClipEndMs(clipOwner.clip);
  const shiftedProject = shiftTrackClipsFromStart(
    project,
    clipOwner.track.id,
    insertionPointMs,
    clipOwner.clip.durationMs,
  );
  const duplicatedClip: TimelineClip = {
    ...clipOwner.clip,
    id: duplicateClipId,
    label: `${clipOwner.clip.label} Copy`,
    startMs: insertionPointMs,
  };
  const nextClipLookup: Record<string, TimelineClip> = {
    ...shiftedProject.clipLookup,
    [duplicateClipId]: duplicatedClip,
  };

  return {
    ...shiftedProject,
    clipLookup: nextClipLookup,
    selectedClipId: duplicateClipId,
    tracks: replaceTrack(
      shiftedProject,
      clipOwner.track.id,
      (track: TimelineTrack): TimelineTrack => ({
        ...track,
        clipIds: sortTrackClipsByStart([...track.clipIds, duplicateClipId], nextClipLookup),
      }),
    ),
  };
}

export function rippleDeleteClip(
  project: TimelineProject,
  clipId: string,
): TimelineProject {
  const clipOwner = getClipOwner(project, clipId);

  if (clipOwner === null) {
    return project;
  }

  const { [clipId]: _removedClip, ...remainingClipLookup } = project.clipLookup;
  const trackWithoutClipIds = clipOwner.track.clipIds.filter(
    (candidateClipId: string): boolean => candidateClipId !== clipId,
  );
  const reducedProject: TimelineProject = {
    ...project,
    clipLookup: remainingClipLookup,
    selectedClipId: null,
    tracks: replaceTrack(project, clipOwner.track.id, (track: TimelineTrack): TimelineTrack => ({
      ...track,
      clipIds: trackWithoutClipIds,
    })),
  };

  return shiftTrackClipsFromStart(
    reducedProject,
    clipOwner.track.id,
    getClipEndMs(clipOwner.clip),
    -clipOwner.clip.durationMs,
  );
}

export function insertGapAtPlayhead(
  project: TimelineProject,
  trackId: string,
  playheadMs: number,
  gapMs = defaultInsertedGapMs,
): TimelineProject {
  if (gapMs <= 0) {
    return project;
  }

  return shiftTrackClipsFromStart(project, trackId, playheadMs, gapMs);
}

export function closeTrackGaps(project: TimelineProject, trackId: string): TimelineProject {
  const targetTrack = project.tracks.find(
    (track: TimelineTrack): boolean => track.id === trackId,
  );

  if (targetTrack === undefined) {
    return project;
  }

  let nextStartMs = 0;
  const nextClipLookup: Record<string, TimelineClip> = { ...project.clipLookup };

  for (const clipId of sortTrackClipsByStart(targetTrack.clipIds, project.clipLookup)) {
    const clip = nextClipLookup[clipId];

    if (clip === undefined) {
      continue;
    }

    nextClipLookup[clipId] = {
      ...clip,
      startMs: nextStartMs,
    };
    nextStartMs += clip.durationMs;
  }

  return {
    ...project,
    clipLookup: nextClipLookup,
    tracks: replaceTrack(project, trackId, (track: TimelineTrack): TimelineTrack => ({
      ...track,
      clipIds: sortTrackClipsByStart(track.clipIds, nextClipLookup),
    })),
  };
}
