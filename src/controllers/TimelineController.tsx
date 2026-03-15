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
import type { MediaItem } from '../services/MediaStorageService';
import { useAudioContext } from '../context/AudioContext';
import { getMediaById } from '../services/MediaStorageService';
import {
  calculateProjectDuration,
  clampTimelinePlayhead,
  createEmptyTimelineProject,
  defaultTimelineClipAudioSettings,
  defaultTimelineClipEffects,
  defaultTimelineTrackState,
  defaultTimelineClipTransform,
  isTimelineTrackActive,
  sortTrackClipsByStart,
  type TimelineClip,
  type TimelineClipAudioSettings,
  type TimelineEnvelopePoint,
  type TimelineHistoryState,
  type TimelineProject,
  type TimelineProjectRecord,
  type TimelineTrack,
  type TimelineTrackType,
} from '../models/Timeline';
import { useRecordingController } from './RecordingController';
import { usePerformanceModeContext } from '../providers/PerformanceModeProvider';
import {
  deleteProject as deleteStoredProject,
  getProject,
  getLatestProject,
  listProjects,
  saveProject,
} from '../services/ProjectStorageService';
import {
  exportProjectPackage,
  importProjectPackage,
} from '../services/ProjectPackageService';
import {
  createAudioMasterTransportSession,
  createFallbackTransportSession,
  type TimelineTransportClockSource,
  type TimelineTransportSession,
} from '../services/TimelineTransport';
import {
  composeTimelinePlaybackAudioInstructions,
  composeTimelineInstructions,
  type TimelineCompositionSnapshot as TimelineCompositionFrame,
} from '../services/TimelineCompositionEngine';
import {
  closeTrackGaps,
  duplicateClipWithRipple,
  insertGapAtPlayhead,
  rippleDeleteClip,
  splitClipAtPlayhead,
} from '../services/TimelineEditingService';
import {
  areTimelineProjectsEquivalent,
  createTimelineHistorySnapshot,
  materializeTimelineProjectFromHistorySnapshot,
  pushTimelineHistoryState,
} from '../services/TimelineHistoryService';
import {
  exportTimelineToMediaItem,
  type TimelineExportProgress,
} from '../services/TimelineExportService';
import { TimelineAudioEngine } from '../services/TimelineAudioEngine';
import {
  setTimelinePreviewState,
  type TimelinePreviewSource,
  type TimelinePreviewMode,
} from '../services/TimelinePreviewStore';
import { saveMedia } from '../services/MediaStorageService';
import { getTopTimelineCompositionLayer } from '../types/compositor';

type TimelineTransportState = 'paused' | 'playing' | 'stopped';
type TimelineExportState = 'cancelled' | 'completed' | 'error' | 'exporting' | 'idle' | 'preparing' | 'saving';
type TimelinePackageState = 'cancelled' | 'completed' | 'error' | 'exporting' | 'idle' | 'importing' | 'preparing';
type TimelineAudioPreviewState = 'error' | 'idle' | 'loading' | 'ready' | 'unavailable';
type TimelineAudioEnvelopeKind = 'pan' | 'volume';

interface TimelineControllerContextValue {
  readonly activeAudioNodeCount: number;
  readonly audioPreviewError: string | null;
  readonly audioPreviewState: TimelineAudioPreviewState;
  readonly canRedo: boolean;
  readonly canUndo: boolean;
  readonly clockSource: TimelineTransportClockSource;
  readonly clips: readonly TimelineClip[];
  readonly compositionFrame: TimelineCompositionFrame;
  readonly error: string | null;
  readonly exportError: string | null;
  readonly exportProgress: number;
  readonly exportState: TimelineExportState;
  readonly isPackagingProject: boolean;
  readonly isDirty: boolean;
  readonly isExporting: boolean;
  readonly packageError: string | null;
  readonly packageProgress: number;
  readonly packageState: TimelinePackageState;
  readonly isLoading: boolean;
  readonly isPlaying: boolean;
  readonly playheadMs: number;
  readonly previewMode: TimelinePreviewMode;
  readonly project: TimelineProject;
  readonly projectList: readonly TimelineProjectRecord[];
  readonly selectedClipId: string | null;
  readonly selectedClip: TimelineClip | null;
  readonly selectedTrackId: string | null;
  readonly selectedTrackLocked: boolean;
  readonly tracks: readonly TimelineTrack[];
  readonly transportState: TimelineTransportState;
  readonly zoomLevel: number;
  addMediaClip: (mediaItem: MediaItem, trackId?: string) => void;
  addTrack: (trackType: TimelineTrackType) => void;
  deleteProject: (projectId: string) => Promise<void>;
  duplicateSelectedClip: () => void;
  cancelProjectPackage: () => void;
  exportProjectPackage: () => Promise<void>;
  importProjectPackage: (file?: File) => Promise<void>;
  insertGapAtPlayhead: (gapMs?: number) => void;
  moveSelectedClipBy: (deltaMs: number) => void;
  pausePlayback: () => void;
  playPlayback: () => Promise<void>;
  refreshProjects: () => Promise<void>;
  removeSelectedClip: () => void;
  renameProject: (nextName: string) => void;
  saveCurrentProject: () => Promise<void>;
  startExport: () => Promise<void>;
  updateSelectedClipAudioEnvelope: (
    envelopeKind: TimelineAudioEnvelopeKind,
    nextPoints: readonly TimelineEnvelopePoint[],
  ) => void;
  updateSelectedClipAudioSettings: (
    nextSettings: Partial<TimelineClipAudioSettings>,
  ) => void;
  selectClip: (clipId: string | null) => void;
  selectProject: (projectId: string) => Promise<void>;
  selectTrack: (trackId: string | null) => void;
  setPreviewMode: (nextMode: TimelinePreviewMode) => void;
  setPlayheadMs: (nextPlayheadMs: number) => void;
  setZoomLevel: (nextZoomLevel: number) => void;
  splitSelectedClipAtPlayhead: () => void;
  stopPlayback: () => void;
  cancelExport: () => void;
  toggleTrackLocked: (trackId: string) => void;
  toggleTrackMuted: (trackId: string) => void;
  toggleTrackSolo: (trackId: string) => void;
  trimSelectedClipBy: (deltaMs: number) => void;
  undo: () => void;
  rippleDeleteSelectedClip: () => void;
  closeSelectedTrackGaps: () => void;
  redo: () => void;
}

const TimelineControllerContext = createContext<TimelineControllerContextValue | null>(null);
const historyLimit = 40;

function buildClipFromMedia(mediaItem: MediaItem, startMs: number): TimelineClip {
  const durationMs =
    mediaItem.type === 'video'
      ? Math.max(1000, mediaItem.durationMs ?? 8_000)
      : 3_000;

  return {
    audio: defaultTimelineClipAudioSettings,
    blendMode: 'normal',
    durationMs,
    effects: defaultTimelineClipEffects,
    id: crypto.randomUUID(),
    label: mediaItem.name,
    opacity: 1,
    source: {
      audioMetadata: {
        hasAudio: mediaItem.type === 'video',
      },
      mediaId: mediaItem.id,
      mediaType: mediaItem.type,
      name: mediaItem.name,
      ...(mediaItem.thumbnail === undefined ? {} : { thumbnail: mediaItem.thumbnail }),
    },
    startMs,
    transform: defaultTimelineClipTransform,
    transitions: [],
    trimEndMs: durationMs,
    trimStartMs: 0,
  };
}

function normalizeProject(project: TimelineProject): TimelineProject {
  const normalizedClipLookup = Object.fromEntries(
    Object.entries(project.clipLookup).map(([clipId, clip]): readonly [string, TimelineClip] => [
      clipId,
      {
        ...clip,
        audio: clip.audio ?? defaultTimelineClipAudioSettings,
        blendMode: clip.blendMode ?? 'normal',
        effects: clip.effects ?? defaultTimelineClipEffects,
        opacity: clip.opacity ?? 1,
        source: {
          ...clip.source,
          audioMetadata: clip.source.audioMetadata ?? {
            hasAudio: clip.source.mediaType === 'video',
          },
        },
        transform: clip.transform ?? defaultTimelineClipTransform,
        transitions: clip.transitions ?? [],
      },
    ]),
  ) as Record<string, TimelineClip>;
  const normalizedTracks = project.tracks.map((track: TimelineTrack): TimelineTrack => ({
    ...track,
    clipIds: sortTrackClipsByStart(track.clipIds, normalizedClipLookup),
    locked: track.locked ?? defaultTimelineTrackState.locked,
    muted: track.muted ?? defaultTimelineTrackState.muted,
    solo: track.solo ?? defaultTimelineTrackState.solo,
  }));
  const normalizedProject: TimelineProject = {
    ...project,
    clipLookup: normalizedClipLookup,
    durationMs: 0,
    playheadMs: Math.max(0, project.playheadMs),
    tracks: normalizedTracks,
    zoomLevel: Math.max(0.5, Math.min(8, project.zoomLevel)),
  };
  const durationMs = calculateProjectDuration(normalizedProject);

  return {
    ...normalizedProject,
    durationMs,
    playheadMs: clampTimelinePlayhead(
      {
        ...normalizedProject,
        durationMs,
      },
      normalizedProject.playheadMs,
    ),
  };
}

function clampAudioEnvelopeValue(
  envelopeKind: TimelineAudioEnvelopeKind,
  value: number,
): number {
  if (envelopeKind === 'pan') {
    return Math.max(-1, Math.min(1, value));
  }

  return Math.max(0, Math.min(2, value));
}

function normalizeAudioEnvelopePoints(
  envelopeKind: TimelineAudioEnvelopeKind,
  points: readonly TimelineEnvelopePoint[],
  durationMs: number,
): readonly TimelineEnvelopePoint[] {
  return [...points]
    .map((point: TimelineEnvelopePoint): TimelineEnvelopePoint => ({
      timeMs: Math.max(0, Math.min(durationMs, point.timeMs)),
      value: clampAudioEnvelopeValue(envelopeKind, point.value),
    }))
    .sort(
      (
        leftPoint: TimelineEnvelopePoint,
        rightPoint: TimelineEnvelopePoint,
      ): number => leftPoint.timeMs - rightPoint.timeMs,
    );
}

type TimelineProjectUpdateMode = 'push-history' | 'replace-present';

export function TimelineController({ children }: PropsWithChildren): JSX.Element {
  const bootstrappedRef = useRef<boolean>(false);
  const animationFrameRef = useRef<number | null>(null);
  const audioEngineRef = useRef<TimelineAudioEngine | null>(null);
  const exportAbortControllerRef = useRef<AbortController | null>(null);
  const packageAbortControllerRef = useRef<AbortController | null>(null);
  const previewSourceCacheRef = useRef<Map<string, MediaItem | null>>(new Map());
  const previewSourceRequestVersionRef = useRef<number>(0);
  const previewSourceRequestsRef = useRef<Map<string, Promise<void>>>(new Map());
  const transportSessionRef = useRef<TimelineTransportSession | null>(null);
  const [audioPreviewError, setAudioPreviewError] = useState<string | null>(null);
  const [audioPreviewState, setAudioPreviewState] =
    useState<TimelineAudioPreviewState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [exportState, setExportState] = useState<TimelineExportState>('idle');
  const [packageError, setPackageError] = useState<string | null>(null);
  const [packageProgress, setPackageProgress] = useState<number>(0);
  const [packageState, setPackageState] = useState<TimelinePackageState>('idle');
  const [historyState, setHistoryState] = useState<TimelineHistoryState>({
    future: [],
    past: [],
    present: createEmptyTimelineProject(),
  });
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [playheadMsState, setPlayheadMsState] = useState<number>(0);
  const [projectList, setProjectList] = useState<readonly TimelineProjectRecord[]>([]);
  const [previewMode, setPreviewModeState] = useState<TimelinePreviewMode>('live');
  const [transportClockSource, setTransportClockSource] =
    useState<TimelineTransportClockSource>('system-fallback');
  const [transportState, setTransportState] = useState<TimelineTransportState>('stopped');
  const { audioContext, ensureAudioContext, timelineOutputNode } = useAudioContext();
  const { capabilities } = usePerformanceModeContext();
  const { refreshMediaItems } = useRecordingController();

  const project = historyState.present;
  const tracks = project.tracks;
  const hasAudioTimelineContent = useMemo<boolean>(
    (): boolean =>
      project.tracks.some(
        (track: TimelineTrack): boolean =>
          isTimelineTrackActive(project, track) &&
          track.type === 'audio' &&
          track.clipIds.some((clipId: string): boolean => {
            const clip = project.clipLookup[clipId];
            return clip !== undefined && clip.source.audioMetadata.hasAudio;
          }),
      ),
    [project],
  );
  const clips = useMemo<readonly TimelineClip[]>(
    (): readonly TimelineClip[] =>
      tracks.flatMap((track: TimelineTrack): readonly TimelineClip[] =>
        track.clipIds
          .map((clipId: string): TimelineClip | undefined => project.clipLookup[clipId])
          .filter((clip: TimelineClip | undefined): clip is TimelineClip => clip !== undefined),
      ),
    [project.clipLookup, tracks],
  );
  const selectedClip =
    project.selectedClipId === null ? null : project.clipLookup[project.selectedClipId] ?? null;
  const selectedTrackLocked =
    (project.selectedTrackId === null
      ? null
      : project.tracks.find((track: TimelineTrack): boolean => track.id === project.selectedTrackId))?.locked ??
    false;
  const playheadMs = playheadMsState;
  const compositionFrame = useMemo<TimelineCompositionFrame>(
    (): TimelineCompositionFrame =>
      composeTimelineInstructions(
        project,
        playheadMs,
        transportClockSource === 'audio-master' && audioContext !== null
          ? audioContext.currentTime
          : null,
        {
          exportMode: false,
          isPlaying: transportState === 'playing',
          qualityScale: capabilities.qualityScale,
        },
      ),
    [
      audioContext,
      capabilities.qualityScale,
      playheadMs,
      project,
      transportClockSource,
      transportState,
    ],
  );
  const topCompositionLayer = getTopTimelineCompositionLayer(compositionFrame);
  const activeAudioNodeCount = compositionFrame.audioNodes.length;
  const activePreviewClip =
    topCompositionLayer === null
      ? null
      : project.clipLookup[topCompositionLayer.clipId] ?? null;

  const persistPlayheadMs = useCallback((nextPlayheadMs: number): void => {
    setHistoryState((currentState: TimelineHistoryState): TimelineHistoryState => {
      const clampedPlayheadMs = clampTimelinePlayhead(currentState.present, nextPlayheadMs);

      if (clampedPlayheadMs === currentState.present.playheadMs) {
        return currentState;
      }

      return {
        ...currentState,
        present: {
          ...currentState.present,
          playheadMs: clampedPlayheadMs,
          updatedAt: Date.now(),
        },
      };
    });
  }, []);

  const stopAnimationFrameLoop = useCallback((): void => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const getOrCreateAudioEngine = useCallback(
    (nextAudioContext: AudioContext): TimelineAudioEngine => {
      if (audioEngineRef.current !== null) {
        return audioEngineRef.current;
      }

      const nextAudioEngine = new TimelineAudioEngine({
        audioContext: nextAudioContext,
        outputNodes:
          timelineOutputNode === null ? [nextAudioContext.destination] : [timelineOutputNode],
      });
      audioEngineRef.current = nextAudioEngine;
      return nextAudioEngine;
    },
    [timelineOutputNode],
  );

  const closeTransportSession = useCallback((): void => {
    transportSessionRef.current?.stop();
    transportSessionRef.current = null;
  }, []);

  const stopTransport = useCallback(
    (nextState: Exclude<TimelineTransportState, 'playing'>, nextPlayheadMs: number): void => {
      stopAnimationFrameLoop();
      closeTransportSession();
      audioEngineRef.current?.stop();

      const clampedPlayheadMs = clampTimelinePlayhead(project, nextPlayheadMs);
      setPlayheadMsState(clampedPlayheadMs);
      persistPlayheadMs(clampedPlayheadMs);
      setTransportState(nextState);
    },
    [closeTransportSession, persistPlayheadMs, project, stopAnimationFrameLoop],
  );

  const refreshProjects = useCallback(async (): Promise<void> => {
    try {
      const nextProjectList = await listProjects();
      setProjectList(nextProjectList);
    } catch (storageError: unknown) {
      setError(
        storageError instanceof Error
          ? storageError.message
          : 'Failed to load saved timeline projects.',
      );
    }
  }, []);

  useEffect((): (() => void) => {
    let isCancelled = false;

    async function loadProject(): Promise<void> {
      try {
        setIsLoading(true);
        const [latestProject, savedProjects] = await Promise.all([
          getLatestProject(),
          listProjects(),
        ]);

        if (isCancelled) {
          return;
        }

        const nextProject =
          latestProject === null ? createEmptyTimelineProject() : normalizeProject(latestProject);

        setProjectList(savedProjects);
        setPlayheadMsState(nextProject.playheadMs);
        setHistoryState({
          future: [],
          past: [],
          present: nextProject,
        });
        setIsDirty(false);
        setError(null);
      } catch (storageError: unknown) {
        if (!isCancelled) {
          setError(
            storageError instanceof Error
              ? storageError.message
              : 'Failed to initialize the timeline project.',
          );
        }
      } finally {
        if (!isCancelled) {
          bootstrappedRef.current = true;
          setIsLoading(false);
        }
      }
    }

    void loadProject();

    return (): void => {
      isCancelled = true;
    };
  }, []);

  useEffect((): void => {
    if (transportState !== 'playing') {
      setPlayheadMsState(project.playheadMs);
    }
  }, [project.id, project.playheadMs, transportState]);

  useEffect((): (() => void) => {
    const previewSourceRequests = previewSourceRequestsRef.current;
    const previewSourceCache = previewSourceCacheRef.current;

    return (): void => {
      stopAnimationFrameLoop();
      closeTransportSession();
      audioEngineRef.current?.stop();
      audioEngineRef.current?.clearCache();
      audioEngineRef.current = null;
      exportAbortControllerRef.current?.abort();
      exportAbortControllerRef.current = null;
      packageAbortControllerRef.current?.abort();
      packageAbortControllerRef.current = null;
      previewSourceRequests.clear();
      previewSourceCache.clear();
    };
  }, [closeTransportSession, stopAnimationFrameLoop]);

  useEffect((): (() => void) => {
    function publishTimelinePreviewState(activeSourceIds: readonly string[]): void {
      if (previewMode === 'live') {
        setTimelinePreviewState({
          activeClipId: null,
          activeSources: {},
          clipOffsetMs: 0,
          composition: null,
          isPlaying: transportState === 'playing',
          mode: 'live',
          status: 'idle',
        });
        return;
      }

      const topLayer = getTopTimelineCompositionLayer(compositionFrame);

      if (topLayer === null || activePreviewClip === null) {
        setTimelinePreviewState({
          activeClipId: null,
          activeSources: {},
          clipOffsetMs: 0,
          composition: compositionFrame,
          isPlaying: transportState === 'playing',
          mode: 'timeline',
          status: 'missing-clip',
        });
        return;
      }

      const activeSources = compositionFrame.layers.reduce(
        (
          sourceMap: Record<string, TimelinePreviewSource>,
          layer,
        ): Record<string, TimelinePreviewSource> => {
          const mediaItem = previewSourceCacheRef.current.get(layer.sourceId);

          if (mediaItem === undefined || mediaItem === null) {
            return sourceMap;
          }

          sourceMap[layer.sourceId] = {
            clipId: layer.clipId,
            mediaItem,
            sourceId: layer.sourceId,
            sourceOffsetMs: layer.sourceOffsetMs,
          };
          return sourceMap;
        },
        {},
      );
      compositionFrame.transitions.forEach((transition): void => {
        if (transition.sourceA !== null) {
          const sourceAMediaItem = previewSourceCacheRef.current.get(transition.sourceA);

          if (sourceAMediaItem !== undefined && sourceAMediaItem !== null) {
            activeSources[transition.sourceA] = {
              clipId: transition.clipId,
              mediaItem: sourceAMediaItem,
              sourceId: transition.sourceA,
              sourceOffsetMs: transition.sourceAOffsetMs ?? 0,
            };
          }
        }

        const sourceBMediaItem = previewSourceCacheRef.current.get(transition.sourceB);

        if (sourceBMediaItem !== undefined && sourceBMediaItem !== null) {
          activeSources[transition.sourceB] = {
            clipId: transition.clipId,
            mediaItem: sourceBMediaItem,
            sourceId: transition.sourceB,
            sourceOffsetMs: transition.sourceBOffsetMs,
          };
        }
      });
      const hasMissingLoadedSource = activeSourceIds.some(
        (sourceId: string): boolean => previewSourceCacheRef.current.get(sourceId) === null,
      );
      const isLoadingAnySource = activeSourceIds.some(
        (sourceId: string): boolean =>
          !previewSourceCacheRef.current.has(sourceId) || previewSourceRequestsRef.current.has(sourceId),
      );

      setTimelinePreviewState({
        activeClipId: topLayer.clipId,
        activeSources,
        clipOffsetMs: Math.max(0, playheadMs - activePreviewClip.startMs),
        composition: compositionFrame,
        isPlaying: transportState === 'playing',
        mode: 'timeline',
        status: hasMissingLoadedSource
          ? 'missing-media'
          : isLoadingAnySource
            ? 'loading'
            : 'ready',
      });
    }

    if (previewMode === 'live') {
      publishTimelinePreviewState([]);

      return (): void => {
        setTimelinePreviewState({
          activeClipId: null,
          activeSources: {},
          clipOffsetMs: 0,
          composition: null,
          isPlaying: false,
          mode: 'live',
          status: 'idle',
        });
      };
    }

    const requestVersion = previewSourceRequestVersionRef.current + 1;
    previewSourceRequestVersionRef.current = requestVersion;
    const activeSourceIds = [
      ...new Set([
        ...compositionFrame.layers.map((layer): string => layer.sourceId),
        ...compositionFrame.transitions.flatMap((transition): readonly string[] =>
          transition.sourceA === null
            ? [transition.sourceB]
            : [transition.sourceA, transition.sourceB],
        ),
      ]),
    ];

    previewSourceCacheRef.current.forEach((_mediaItem: MediaItem | null, sourceId: string): void => {
      if (!activeSourceIds.includes(sourceId)) {
        previewSourceCacheRef.current.delete(sourceId);
      }
    });

    publishTimelinePreviewState(activeSourceIds);

    activeSourceIds.forEach((sourceId: string): void => {
      if (
        previewSourceCacheRef.current.has(sourceId) ||
        previewSourceRequestsRef.current.has(sourceId)
      ) {
        return;
      }

      const request = getMediaById(sourceId)
        .then((mediaItem: MediaItem | null): void => {
          previewSourceCacheRef.current.set(sourceId, mediaItem);
        })
        .catch((): void => {
          previewSourceCacheRef.current.set(sourceId, null);
        })
        .finally((): void => {
          previewSourceRequestsRef.current.delete(sourceId);

          if (previewSourceRequestVersionRef.current !== requestVersion) {
            return;
          }

          publishTimelinePreviewState(activeSourceIds);
        });

      previewSourceRequestsRef.current.set(sourceId, request);
    });

    return (): void => undefined;
  }, [
    activePreviewClip,
    compositionFrame,
    playheadMs,
    previewMode,
    transportState,
  ]);

  useEffect((): (() => void) | void => {
    if (previewMode !== 'timeline' || transportState === 'playing') {
      setAudioPreviewError(null);
      setAudioPreviewState('idle');
      return undefined;
    }

    if (compositionFrame.audioNodes.length === 0) {
      setAudioPreviewError(null);
      setAudioPreviewState('idle');
      return undefined;
    }

    if (audioContext === null) {
      setAudioPreviewError('Audio preview requires an active Web Audio context.');
      setAudioPreviewState('unavailable');
      return undefined;
    }

    let isCancelled = false;
    setAudioPreviewError(null);
    setAudioPreviewState('loading');

    void getOrCreateAudioEngine(audioContext)
      .prefetchInstructions(compositionFrame.audioNodes)
      .then((): void => {
        if (!isCancelled) {
          setAudioPreviewState('ready');
        }
      })
      .catch((prefetchError: unknown): void => {
        if (isCancelled) {
          return;
        }

        setAudioPreviewError(
          prefetchError instanceof Error
            ? prefetchError.message
            : 'Failed to prefetch timeline audio for preview.',
        );
        setAudioPreviewState('error');
      });

    return (): void => {
      isCancelled = true;
    };
  }, [
    audioContext,
    compositionFrame.audioNodes,
    getOrCreateAudioEngine,
    previewMode,
    transportState,
  ]);

  useEffect((): (() => void) | void => {
    if (!bootstrappedRef.current) {
      return undefined;
    }

    const saveTimeout = window.setTimeout((): void => {
      void saveProject(project)
        .then((): Promise<void> => refreshProjects())
        .then((): void => {
          setIsDirty(false);
        })
        .catch((storageError: unknown): void => {
          setError(
            storageError instanceof Error
              ? storageError.message
              : 'Failed to save the timeline project.',
          );
        });
    }, 400);

    return (): void => {
      window.clearTimeout(saveTimeout);
    };
  }, [project, refreshProjects]);

  const updateProject = useCallback(
    (
      updater: (currentProject: TimelineProject) => TimelineProject,
      mode: TimelineProjectUpdateMode = 'push-history',
    ): void => {
      setHistoryState((currentState: TimelineHistoryState): TimelineHistoryState => {
        const nextProject = updater(currentState.present);
        const normalizedNextProject = normalizeProject({
          ...nextProject,
          updatedAt:
            mode === 'push-history' ? Date.now() : currentState.present.updatedAt,
        });

        if (areTimelineProjectsEquivalent(normalizedNextProject, currentState.present)) {
          return currentState;
        }

        if (mode === 'replace-present') {
          return {
            ...currentState,
            present: normalizedNextProject,
          };
        }

        setIsDirty(true);
        return pushTimelineHistoryState(currentState, normalizedNextProject, historyLimit);
      });
    },
    [],
  );

  const isTrackLocked = useCallback(
    (currentProject: TimelineProject, trackId: string | null): boolean => {
      if (trackId === null) {
        return false;
      }

      return (
        currentProject.tracks.find((track: TimelineTrack): boolean => track.id === trackId)?.locked ??
        false
      );
    },
    [],
  );

  const getOwningTrack = useCallback(
    (currentProject: TimelineProject, clipId: string | null): TimelineTrack | null => {
      if (clipId === null) {
        return null;
      }

      return (
        currentProject.tracks.find((track: TimelineTrack): boolean => track.clipIds.includes(clipId)) ??
        null
      );
    },
    [],
  );

  const addTrack = useCallback((trackType: TimelineTrackType): void => {
    updateProject((currentProject: TimelineProject): TimelineProject => {
      const nextTrackIndex =
        currentProject.tracks.filter((track: TimelineTrack): boolean => track.type === trackType)
          .length + 1;
      const nextTrackId = crypto.randomUUID();

      return {
        ...currentProject,
        selectedTrackId: nextTrackId,
        tracks: [
          ...currentProject.tracks,
          {
            clipIds: [],
            id: nextTrackId,
            label: `${trackType === 'video' ? 'Video' : 'Audio'} Track ${nextTrackIndex}`,
            locked: defaultTimelineTrackState.locked,
            muted: defaultTimelineTrackState.muted,
            solo: defaultTimelineTrackState.solo,
            type: trackType,
          },
        ],
      };
    });
  }, [updateProject]);

  const selectTrack = useCallback((trackId: string | null): void => {
    updateProject((currentProject: TimelineProject): TimelineProject => ({
      ...currentProject,
      selectedTrackId: trackId,
    }), 'replace-present');
  }, [updateProject]);

  const selectClip = useCallback((clipId: string | null): void => {
    updateProject((currentProject: TimelineProject): TimelineProject => {
      let nextTrackId = currentProject.selectedTrackId;

      if (clipId !== null) {
        const owningTrack = currentProject.tracks.find((track: TimelineTrack): boolean =>
          track.clipIds.includes(clipId),
        );

        nextTrackId = owningTrack?.id ?? nextTrackId;
      }

      return {
        ...currentProject,
        selectedClipId: clipId,
        selectedTrackId: nextTrackId,
      };
    }, 'replace-present');
  }, [updateProject]);

  const addMediaClip = useCallback((mediaItem: MediaItem, trackId?: string): void => {
    updateProject((currentProject: TimelineProject): TimelineProject => {
      const targetTrack =
        currentProject.tracks.find((track: TimelineTrack): boolean => track.id === (trackId ?? currentProject.selectedTrackId)) ??
        currentProject.tracks[0];

      if (targetTrack === undefined || targetTrack.locked) {
        return currentProject;
      }

      const nextStartMs = targetTrack.clipIds.reduce((maxStart: number, clipId: string): number => {
        const clip = currentProject.clipLookup[clipId];

        if (clip === undefined) {
          return maxStart;
        }

        return Math.max(maxStart, clip.startMs + clip.durationMs);
      }, 0);
      const nextClip = buildClipFromMedia(mediaItem, nextStartMs);

      return {
        ...currentProject,
        clipLookup: {
          ...currentProject.clipLookup,
          [nextClip.id]: nextClip,
        },
        selectedClipId: nextClip.id,
        selectedTrackId: targetTrack.id,
        tracks: currentProject.tracks.map((track: TimelineTrack): TimelineTrack =>
          track.id === targetTrack.id
            ? {
                ...track,
                clipIds: sortTrackClipsByStart(
                  [...track.clipIds, nextClip.id],
                  {
                    ...currentProject.clipLookup,
                    [nextClip.id]: nextClip,
                  },
                ),
              }
            : track,
        ),
      };
    });
  }, [updateProject]);

  const splitSelectedClipAtPlayhead = useCallback((): void => {
    updateProject((currentProject: TimelineProject): TimelineProject => {
      const selectedId = currentProject.selectedClipId;

      if (selectedId === null || getOwningTrack(currentProject, selectedId)?.locked === true) {
        return currentProject;
      }

      return splitClipAtPlayhead(currentProject, selectedId, playheadMs);
    });
  }, [getOwningTrack, playheadMs, updateProject]);

  const duplicateSelectedClip = useCallback((): void => {
    updateProject((currentProject: TimelineProject): TimelineProject => {
      const selectedId = currentProject.selectedClipId;

      if (selectedId === null || getOwningTrack(currentProject, selectedId)?.locked === true) {
        return currentProject;
      }

      return duplicateClipWithRipple(currentProject, selectedId);
    });
  }, [getOwningTrack, updateProject]);

  const moveSelectedClipBy = useCallback((deltaMs: number): void => {
    updateProject((currentProject: TimelineProject): TimelineProject => {
      const selectedId = currentProject.selectedClipId;

      if (selectedId === null || getOwningTrack(currentProject, selectedId)?.locked === true) {
        return currentProject;
      }

      const selectedTimelineClip = currentProject.clipLookup[selectedId];

      if (selectedTimelineClip === undefined) {
        return currentProject;
      }

      return {
        ...currentProject,
        clipLookup: {
          ...currentProject.clipLookup,
          [selectedId]: {
            ...selectedTimelineClip,
            startMs: Math.max(0, selectedTimelineClip.startMs + deltaMs),
          },
        },
        tracks: currentProject.tracks.map((track: TimelineTrack): TimelineTrack => ({
          ...track,
          clipIds: sortTrackClipsByStart(track.clipIds, {
            ...currentProject.clipLookup,
            [selectedId]: {
              ...selectedTimelineClip,
              startMs: Math.max(0, selectedTimelineClip.startMs + deltaMs),
            },
          }),
        })),
      };
    });
  }, [getOwningTrack, updateProject]);

  const trimSelectedClipBy = useCallback((deltaMs: number): void => {
    updateProject((currentProject: TimelineProject): TimelineProject => {
      const selectedId = currentProject.selectedClipId;

      if (selectedId === null || getOwningTrack(currentProject, selectedId)?.locked === true) {
        return currentProject;
      }

      const selectedTimelineClip = currentProject.clipLookup[selectedId];

      if (selectedTimelineClip === undefined) {
        return currentProject;
      }

      const nextDurationMs = Math.max(500, selectedTimelineClip.durationMs + deltaMs);

      return {
        ...currentProject,
        clipLookup: {
          ...currentProject.clipLookup,
          [selectedId]: {
            ...selectedTimelineClip,
            durationMs: nextDurationMs,
            trimEndMs: Math.max(
              selectedTimelineClip.trimStartMs + 500,
              selectedTimelineClip.trimStartMs + nextDurationMs,
            ),
          },
        },
      };
    });
  }, [getOwningTrack, updateProject]);

  const removeSelectedClip = useCallback((): void => {
    updateProject((currentProject: TimelineProject): TimelineProject => {
      const selectedId = currentProject.selectedClipId;

      if (selectedId === null || getOwningTrack(currentProject, selectedId)?.locked === true) {
        return currentProject;
      }

      const { [selectedId]: _removedClip, ...nextClipLookup } = currentProject.clipLookup;

      return {
        ...currentProject,
        clipLookup: nextClipLookup,
        selectedClipId: null,
        tracks: currentProject.tracks.map((track: TimelineTrack): TimelineTrack => ({
          ...track,
          clipIds: track.clipIds.filter((clipId: string): boolean => clipId !== selectedId),
        })),
      };
    });
  }, [getOwningTrack, updateProject]);

  const rippleDeleteSelectedClip = useCallback((): void => {
    updateProject((currentProject: TimelineProject): TimelineProject => {
      const selectedId = currentProject.selectedClipId;

      if (selectedId === null || getOwningTrack(currentProject, selectedId)?.locked === true) {
        return currentProject;
      }

      return rippleDeleteClip(currentProject, selectedId);
    });
  }, [getOwningTrack, updateProject]);

  const renameProject = useCallback((nextName: string): void => {
    const normalizedName = nextName.trim();

    if (normalizedName.length === 0) {
      return;
    }

    updateProject((currentProject: TimelineProject): TimelineProject => ({
      ...currentProject,
      name: normalizedName,
    }));
  }, [updateProject]);

  const setPlayheadMs = useCallback((nextPlayheadMs: number): void => {
    const clampedPlayheadMs = clampTimelinePlayhead(project, nextPlayheadMs);
    setPlayheadMsState(clampedPlayheadMs);

    if (transportState === 'playing') {
      stopTransport('paused', clampedPlayheadMs);
      return;
    }

    persistPlayheadMs(clampedPlayheadMs);
  }, [persistPlayheadMs, project, stopTransport, transportState]);

  const setPreviewMode = useCallback((nextMode: TimelinePreviewMode): void => {
    setPreviewModeState(nextMode);
  }, []);

  const insertGapAtCurrentPlayhead = useCallback((gapMs = 1_000): void => {
    updateProject((currentProject: TimelineProject): TimelineProject => {
      const targetTrackId = currentProject.selectedTrackId ?? currentProject.tracks[0]?.id;

      if (targetTrackId === undefined || isTrackLocked(currentProject, targetTrackId)) {
        return currentProject;
      }

      return insertGapAtPlayhead(currentProject, targetTrackId, playheadMs, gapMs);
    });
  }, [isTrackLocked, playheadMs, updateProject]);

  const closeSelectedTrackGaps = useCallback((): void => {
    updateProject((currentProject: TimelineProject): TimelineProject => {
      const targetTrackId = currentProject.selectedTrackId ?? currentProject.tracks[0]?.id;

      if (targetTrackId === undefined || isTrackLocked(currentProject, targetTrackId)) {
        return currentProject;
      }

      return closeTrackGaps(currentProject, targetTrackId);
    });
  }, [isTrackLocked, updateProject]);

  const toggleTrackMuted = useCallback((trackId: string): void => {
    updateProject((currentProject: TimelineProject): TimelineProject => ({
      ...currentProject,
      tracks: currentProject.tracks.map((track: TimelineTrack): TimelineTrack =>
        track.id === trackId
          ? {
              ...track,
              muted: !track.muted,
            }
          : track,
      ),
    }));
  }, [updateProject]);

  const toggleTrackSolo = useCallback((trackId: string): void => {
    updateProject((currentProject: TimelineProject): TimelineProject => ({
      ...currentProject,
      tracks: currentProject.tracks.map((track: TimelineTrack): TimelineTrack =>
        track.id === trackId
          ? {
              ...track,
              solo: !track.solo,
            }
          : track,
      ),
    }));
  }, [updateProject]);

  const toggleTrackLocked = useCallback((trackId: string): void => {
    updateProject((currentProject: TimelineProject): TimelineProject => ({
      ...currentProject,
      tracks: currentProject.tracks.map((track: TimelineTrack): TimelineTrack =>
        track.id === trackId
          ? {
              ...track,
              locked: !track.locked,
            }
          : track,
      ),
    }));
  }, [updateProject]);

  const setZoomLevel = useCallback((nextZoomLevel: number): void => {
    updateProject((currentProject: TimelineProject): TimelineProject => ({
      ...currentProject,
      zoomLevel: Math.max(0.5, Math.min(8, nextZoomLevel)),
    }), 'replace-present');
  }, [updateProject]);

  const updateSelectedClipAudioSettings = useCallback(
    (nextSettings: Partial<TimelineClipAudioSettings>): void => {
      updateProject((currentProject: TimelineProject): TimelineProject => {
        const selectedId = currentProject.selectedClipId;

        if (selectedId === null || getOwningTrack(currentProject, selectedId)?.locked === true) {
          return currentProject;
        }

        const selectedTimelineClip = currentProject.clipLookup[selectedId];

        if (selectedTimelineClip === undefined || !selectedTimelineClip.source.audioMetadata.hasAudio) {
          return currentProject;
        }

        const nextAudio: TimelineClipAudioSettings = {
          ...selectedTimelineClip.audio,
          ...nextSettings,
          fadeInMs: Math.max(
            0,
            Math.min(
              selectedTimelineClip.durationMs,
              nextSettings.fadeInMs ?? selectedTimelineClip.audio.fadeInMs,
            ),
          ),
          fadeOutMs: Math.max(
            0,
            Math.min(
              selectedTimelineClip.durationMs,
              nextSettings.fadeOutMs ?? selectedTimelineClip.audio.fadeOutMs,
            ),
          ),
          gain: Math.max(0, Math.min(2, nextSettings.gain ?? selectedTimelineClip.audio.gain)),
          muted: nextSettings.muted ?? selectedTimelineClip.audio.muted,
          pan: Math.max(-1, Math.min(1, nextSettings.pan ?? selectedTimelineClip.audio.pan)),
          panEnvelope:
            nextSettings.panEnvelope ?? selectedTimelineClip.audio.panEnvelope,
          volumeEnvelope:
            nextSettings.volumeEnvelope ?? selectedTimelineClip.audio.volumeEnvelope,
        };

        return {
          ...currentProject,
          clipLookup: {
            ...currentProject.clipLookup,
            [selectedId]: {
              ...selectedTimelineClip,
              audio: nextAudio,
            },
          },
        };
      });
    },
    [getOwningTrack, updateProject],
  );

  const updateSelectedClipAudioEnvelope = useCallback(
    (
      envelopeKind: TimelineAudioEnvelopeKind,
      nextPoints: readonly TimelineEnvelopePoint[],
    ): void => {
      updateProject((currentProject: TimelineProject): TimelineProject => {
        const selectedId = currentProject.selectedClipId;

        if (selectedId === null || getOwningTrack(currentProject, selectedId)?.locked === true) {
          return currentProject;
        }

        const selectedTimelineClip = currentProject.clipLookup[selectedId];

        if (selectedTimelineClip === undefined || !selectedTimelineClip.source.audioMetadata.hasAudio) {
          return currentProject;
        }

        const normalizedPoints = normalizeAudioEnvelopePoints(
          envelopeKind,
          nextPoints,
          selectedTimelineClip.durationMs,
        );

        return {
          ...currentProject,
          clipLookup: {
            ...currentProject.clipLookup,
            [selectedId]: {
              ...selectedTimelineClip,
              audio: {
                ...selectedTimelineClip.audio,
                panEnvelope:
                  envelopeKind === 'pan'
                    ? normalizedPoints
                    : selectedTimelineClip.audio.panEnvelope,
                volumeEnvelope:
                  envelopeKind === 'volume'
                    ? normalizedPoints
                    : selectedTimelineClip.audio.volumeEnvelope,
              },
            },
          },
        };
      });
    },
    [getOwningTrack, updateProject],
  );

  const undo = useCallback((): void => {
    setHistoryState((currentState: TimelineHistoryState): TimelineHistoryState => {
      const previousSnapshot = currentState.past[currentState.past.length - 1];

      if (previousSnapshot === undefined) {
        return currentState;
      }

      setIsDirty(true);
      const previousProject = materializeTimelineProjectFromHistorySnapshot(
        previousSnapshot,
        currentState.present,
      );
      return {
        future: [createTimelineHistorySnapshot(currentState.present), ...currentState.future],
        past: currentState.past.slice(0, -1),
        present: previousProject,
      };
    });
  }, []);

  const redo = useCallback((): void => {
    setHistoryState((currentState: TimelineHistoryState): TimelineHistoryState => {
      const nextSnapshot = currentState.future[0];

      if (nextSnapshot === undefined) {
        return currentState;
      }

      setIsDirty(true);
      const nextProject = materializeTimelineProjectFromHistorySnapshot(
        nextSnapshot,
        currentState.present,
      );
      return {
        future: currentState.future.slice(1),
        past: [...currentState.past, createTimelineHistorySnapshot(currentState.present)].slice(
          -historyLimit,
        ),
        present: nextProject,
      };
    });
  }, []);

  const saveCurrentProject = useCallback(async (): Promise<void> => {
    try {
      await saveProject(project);
      await refreshProjects();
      setIsDirty(false);
    } catch (storageError: unknown) {
      setError(
        storageError instanceof Error
          ? storageError.message
          : 'Failed to save the current timeline project.',
      );
    }
  }, [project, refreshProjects]);

  const pausePlayback = useCallback((): void => {
    if (transportState !== 'playing') {
      return;
    }

    const nextPlayheadMs = transportSessionRef.current?.getCurrentTimeMs() ?? playheadMsState;
    stopTransport('paused', nextPlayheadMs);
  }, [playheadMsState, stopTransport, transportState]);

  const stopPlayback = useCallback((): void => {
    stopTransport('stopped', 0);
  }, [stopTransport]);

  const cancelExport = useCallback((): void => {
    exportAbortControllerRef.current?.abort();
    exportAbortControllerRef.current = null;
    setExportState('cancelled');
  }, []);

  const cancelProjectPackage = useCallback((): void => {
    packageAbortControllerRef.current?.abort();
    packageAbortControllerRef.current = null;
    setPackageState('cancelled');
  }, []);

  const playPlayback = useCallback(async (): Promise<void> => {
    if (transportState === 'playing' || project.durationMs <= 0) {
      return;
    }

    try {
      let nextTransportSession: TimelineTransportSession | null = null;

      if (hasAudioTimelineContent) {
        const ensuredAudioContext = await ensureAudioContext();

        if (ensuredAudioContext !== null) {
          if (ensuredAudioContext.state === 'suspended') {
            await ensuredAudioContext.resume();
          }

          const audioEngine = getOrCreateAudioEngine(ensuredAudioContext);
          const preloadInstructions = composeTimelinePlaybackAudioInstructions(
            project,
            playheadMsState,
            null,
          );

          await audioEngine.prefetchInstructions(preloadInstructions);

          const playbackAnchorSeconds = ensuredAudioContext.currentTime + 0.05;
          await audioEngine.scheduleInstructions(
            composeTimelinePlaybackAudioInstructions(
              project,
              playheadMsState,
              playbackAnchorSeconds,
            ),
          );

          nextTransportSession = createAudioMasterTransportSession(ensuredAudioContext, {
            anchorSeconds: playbackAnchorSeconds,
            initialPlayheadMs: playheadMsState,
          });
        }
      }

      if (nextTransportSession === null) {
        nextTransportSession = createFallbackTransportSession({
          initialPlayheadMs: playheadMsState,
        });
      }

      closeTransportSession();
      stopAnimationFrameLoop();
      transportSessionRef.current = nextTransportSession;
      setTransportClockSource(nextTransportSession.clockSource);
      setTransportState('playing');

      const step = (): void => {
        const currentTransportSession = transportSessionRef.current;

        if (currentTransportSession === null) {
          return;
        }

        const nextPlayheadMs = clampTimelinePlayhead(
          project,
          currentTransportSession.getCurrentTimeMs(),
        );
        setPlayheadMsState(nextPlayheadMs);

        if (nextPlayheadMs >= project.durationMs) {
          stopTransport('stopped', project.durationMs);
          return;
        }

        animationFrameRef.current = window.requestAnimationFrame(step);
      };

      animationFrameRef.current = window.requestAnimationFrame(step);
    } catch (playbackError: unknown) {
      setError(
        playbackError instanceof Error
          ? playbackError.message
          : 'Failed to start timeline playback.',
      );
    }
  }, [
    closeTransportSession,
    ensureAudioContext,
    getOrCreateAudioEngine,
    hasAudioTimelineContent,
    playheadMsState,
    project,
    stopAnimationFrameLoop,
    stopTransport,
    transportState,
  ]);

  const startExport = useCallback(async (): Promise<void> => {
    if (exportState === 'preparing' || exportState === 'exporting' || exportState === 'saving') {
      return;
    }

    if (project.durationMs <= 0) {
      setExportError('Cannot export an empty timeline.');
      setExportState('error');
      return;
    }

    const exportProjectSnapshot = normalizeProject(project);
    const abortController = new AbortController();
    exportAbortControllerRef.current = abortController;
    setExportError(null);
    setExportProgress(0);
    setExportState('preparing');

    try {
      const exportedMediaItem = await exportTimelineToMediaItem({
        onProgress: (progress: TimelineExportProgress): void => {
          setExportProgress(progress.fraction);
          setExportState('exporting');
        },
        project: exportProjectSnapshot,
        signal: abortController.signal,
      });

      if (abortController.signal.aborted) {
        setExportState('cancelled');
        return;
      }

      setExportState('saving');
      await saveMedia(exportedMediaItem);
      await refreshMediaItems();
      setExportProgress(1);
      setExportState('completed');
    } catch (exporterError: unknown) {
      if (abortController.signal.aborted) {
        setExportState('cancelled');
        return;
      }

      setExportError(
        exporterError instanceof Error
          ? exporterError.message
          : 'Timeline export failed.',
      );
      setExportState('error');
    } finally {
      if (exportAbortControllerRef.current === abortController) {
        exportAbortControllerRef.current = null;
      }
    }
  }, [exportState, project, refreshMediaItems]);

  const startProjectPackageExport = useCallback(async (): Promise<void> => {
    if (packageState === 'preparing' || packageState === 'exporting' || packageState === 'importing') {
      return;
    }

    const packageProjectSnapshot = normalizeProject(project);
    const abortController = new AbortController();
    packageAbortControllerRef.current = abortController;
    setPackageError(null);
    setPackageProgress(0);
    setPackageState('preparing');

    try {
      await exportProjectPackage({
        onProgress: (progress): void => {
          setPackageProgress(progress.fraction);
          setPackageState(progress.stage === 'preparing' ? 'preparing' : 'exporting');
        },
        project: packageProjectSnapshot,
        signal: abortController.signal,
      });

      if (abortController.signal.aborted) {
        setPackageState('cancelled');
        return;
      }

      setPackageProgress(1);
      setPackageState('completed');
    } catch (packageServiceError: unknown) {
      if (abortController.signal.aborted) {
        setPackageState('cancelled');
        return;
      }

      setPackageError(
        packageServiceError instanceof Error
          ? packageServiceError.message
          : 'Project package export failed.',
      );
      setPackageState('error');
    } finally {
      if (packageAbortControllerRef.current === abortController) {
        packageAbortControllerRef.current = null;
      }
    }
  }, [packageState, project]);

  const importProjectPackageFile = useCallback(async (file?: File): Promise<void> => {
    if (packageState === 'preparing' || packageState === 'exporting' || packageState === 'importing') {
      return;
    }

    setPackageError(null);
    setPackageProgress(0);
    setPackageState('importing');

    try {
      const { importedProject } = await importProjectPackage(file);
      await saveProject(importedProject);
      setHistoryState({
        future: [],
        past: [],
        present: normalizeProject(importedProject),
      });
      setPlayheadMsState(importedProject.playheadMs);
      setIsDirty(false);
      await refreshProjects();
      setPackageProgress(1);
      setPackageState('completed');
    } catch (packageImportError: unknown) {
      setPackageError(
        packageImportError instanceof Error
          ? packageImportError.message
          : 'Project package import failed.',
      );
      setPackageState('error');
    }
  }, [packageState, refreshProjects]);

  const selectProject = useCallback(async (projectId: string): Promise<void> => {
    try {
      const nextCurrentPlayheadMs =
        transportSessionRef.current?.getCurrentTimeMs() ?? playheadMsState;
      stopTransport('paused', nextCurrentPlayheadMs);
      const nextProject = await getProject(projectId);

      if (nextProject === null) {
        return;
      }

      setHistoryState({
        future: [],
        past: [],
        present: normalizeProject(nextProject),
      });
      setPlayheadMsState(nextProject.playheadMs);
      setIsDirty(false);
      await refreshProjects();
    } catch (storageError: unknown) {
      setError(
        storageError instanceof Error
          ? storageError.message
          : 'Failed to open the selected project.',
      );
    }
  }, [playheadMsState, refreshProjects, stopTransport]);

  const deleteProject = useCallback(async (projectId: string): Promise<void> => {
    try {
      if (project.id === projectId) {
        stopTransport('stopped', 0);
      }

      await deleteStoredProject(projectId);
      const remainingProjects = await listProjects();
      setProjectList(remainingProjects);

      if (project.id === projectId) {
        const replacementProject =
          remainingProjects[0]?.project ?? createEmptyTimelineProject('Untitled Project');
        setHistoryState({
          future: [],
          past: [],
          present: normalizeProject(replacementProject),
        });
        setPlayheadMsState(replacementProject.playheadMs);
      }
    } catch (storageError: unknown) {
      setError(
        storageError instanceof Error
          ? storageError.message
          : 'Failed to delete the selected project.',
      );
    }
  }, [project.id, stopTransport]);

  const contextValue = useMemo<TimelineControllerContextValue>(
    (): TimelineControllerContextValue => ({
      addMediaClip,
      addTrack,
      activeAudioNodeCount,
      audioPreviewError,
      audioPreviewState,
      canRedo: historyState.future.length > 0,
      canUndo: historyState.past.length > 0,
      cancelProjectPackage,
      cancelExport,
      clockSource:
        transportState === 'playing'
          ? transportClockSource
          : hasAudioTimelineContent && audioContext !== null
            ? 'audio-master'
            : 'system-fallback',
      clips,
      compositionFrame,
      deleteProject,
      duplicateSelectedClip,
      error,
      exportError,
      exportProgress,
      exportState,
      exportProjectPackage: startProjectPackageExport,
      importProjectPackage: importProjectPackageFile,
      insertGapAtPlayhead: insertGapAtCurrentPlayhead,
      isDirty,
      isExporting: exportState === 'preparing' || exportState === 'exporting' || exportState === 'saving',
      isPackagingProject:
        packageState === 'preparing' || packageState === 'exporting' || packageState === 'importing',
      isLoading,
      isPlaying: transportState === 'playing',
      moveSelectedClipBy,
      packageError,
      packageProgress,
      packageState,
      pausePlayback,
      playPlayback,
      playheadMs,
      previewMode,
      project,
      projectList,
      refreshProjects,
      rippleDeleteSelectedClip,
      removeSelectedClip,
      renameProject,
      redo,
      saveCurrentProject,
      selectedTrackLocked,
      startExport,
      updateSelectedClipAudioEnvelope,
      updateSelectedClipAudioSettings,
      selectClip,
      selectProject,
      selectedClip,
      selectedClipId: project.selectedClipId,
      selectedTrackId: project.selectedTrackId,
      selectTrack,
      setPlayheadMs,
      setPreviewMode,
      setZoomLevel,
      splitSelectedClipAtPlayhead,
      stopPlayback,
      tracks,
      toggleTrackLocked,
      toggleTrackMuted,
      toggleTrackSolo,
      transportState,
      trimSelectedClipBy,
      undo,
      closeSelectedTrackGaps,
      zoomLevel: project.zoomLevel,
    }),
    [
      addMediaClip,
      addTrack,
      activeAudioNodeCount,
      audioPreviewError,
      audioPreviewState,
      audioContext,
      cancelProjectPackage,
      cancelExport,
      clips,
      closeSelectedTrackGaps,
      compositionFrame,
      deleteProject,
      duplicateSelectedClip,
      error,
      exportError,
      exportProgress,
      exportState,
      importProjectPackageFile,
      hasAudioTimelineContent,
      historyState.future.length,
      historyState.past.length,
      insertGapAtCurrentPlayhead,
      isDirty,
      isLoading,
      packageError,
      packageProgress,
      packageState,
      moveSelectedClipBy,
      pausePlayback,
      playPlayback,
      playheadMs,
      previewMode,
      project,
      projectList,
      refreshProjects,
      rippleDeleteSelectedClip,
      removeSelectedClip,
      renameProject,
      redo,
      saveCurrentProject,
      selectedTrackLocked,
      startProjectPackageExport,
      startExport,
      updateSelectedClipAudioEnvelope,
      updateSelectedClipAudioSettings,
      selectClip,
      selectProject,
      selectedClip,
      selectTrack,
      setPlayheadMs,
      setPreviewMode,
      setZoomLevel,
      splitSelectedClipAtPlayhead,
      stopPlayback,
      tracks,
      toggleTrackLocked,
      toggleTrackMuted,
      toggleTrackSolo,
      transportClockSource,
      transportState,
      trimSelectedClipBy,
      undo,
    ],
  );

  return (
    <TimelineControllerContext.Provider value={contextValue}>
      {children}
    </TimelineControllerContext.Provider>
  );
}

export function useTimelineController(): TimelineControllerContextValue {
  const contextValue = useContext(TimelineControllerContext);

  if (contextValue === null) {
    throw new Error('useTimelineController must be used within a TimelineController.');
  }

  return contextValue;
}
