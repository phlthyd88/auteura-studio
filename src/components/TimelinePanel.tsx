import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ContentCutRoundedIcon from '@mui/icons-material/ContentCutRounded';
import CopyAllRoundedIcon from '@mui/icons-material/CopyAllRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import FormatLineSpacingRoundedIcon from '@mui/icons-material/FormatLineSpacingRounded';
import LockOpenRoundedIcon from '@mui/icons-material/LockOpenRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import RedoRoundedIcon from '@mui/icons-material/RedoRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import SurroundSoundRoundedIcon from '@mui/icons-material/SurroundSoundRounded';
import TimelineRoundedIcon from '@mui/icons-material/TimelineRounded';
import UndoRoundedIcon from '@mui/icons-material/UndoRounded';
import UploadRoundedIcon from '@mui/icons-material/UploadRounded';
import VolumeOffRoundedIcon from '@mui/icons-material/VolumeOffRounded';
import VolumeUpRoundedIcon from '@mui/icons-material/VolumeUpRounded';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select, { type SelectChangeEvent } from '@mui/material/Select';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StudioDeckSection } from './StudioDeckSection';
import { StudioEmptyState } from './StudioEmptyState';
import { useAudioContext } from '../context/AudioContext';
import { useRecordingController } from '../controllers/RecordingController';
import { useTimelineController } from '../controllers/TimelineController';
import { AudioInspectorPanel } from './AudioInspectorPanel';
import { TimelineWaveform } from './TimelineWaveform';
import type { TimelineClip, TimelineTrack } from '../models/Timeline';
import type { MediaItem } from '../services/MediaStorageService';
import {
  WaveformAnalysisService,
  type WaveformSummary,
} from '../services/WaveformAnalysisService';

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value: number): string => value.toString().padStart(2, '0'))
    .join(':');
}

function formatTrackLabel(track: TimelineTrack, clipCount: number): string {
  return `${track.label} (${clipCount} clip${clipCount === 1 ? '' : 's'})`;
}

export function TimelinePanel(): JSX.Element {
  const {
    addMediaClip,
    addTrack,
    activeAudioNodeCount,
    audioPreviewError,
    audioPreviewState,
    cancelExport,
    cancelProjectPackage,
    canRedo,
    canUndo,
    clockSource,
    closeSelectedTrackGaps,
    clips,
    compositionFrame,
    deleteProject,
    duplicateSelectedClip,
    error,
    exportProjectPackage,
    exportError,
    exportProgress,
    exportState,
    importProjectPackage,
    insertGapAtPlayhead,
    isDirty,
    isExporting,
    isPackagingProject,
    isLoading,
    isPlaying,
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
    rippleDeleteSelectedClip,
    removeSelectedClip,
    renameProject,
    redo,
    saveCurrentProject,
    selectedTrackLocked,
    startExport,
    selectClip,
    selectProject,
    selectedClip,
    selectedTrackId,
    selectTrack,
    setPlayheadMs,
    setPreviewMode,
    setZoomLevel,
    splitSelectedClipAtPlayhead,
    stopPlayback,
    toggleTrackLocked,
    toggleTrackMuted,
    toggleTrackSolo,
    tracks,
    transportState,
    trimSelectedClipBy,
    undo,
    updateSelectedClipAudioEnvelope,
    updateSelectedClipAudioSettings,
    zoomLevel,
  } = useTimelineController();
  const { mediaItems } = useRecordingController();
  const { audioContext, ensureAudioContext } = useAudioContext();
  const waveformServiceRef = useRef<WaveformAnalysisService | null>(null);
  const packageImportInputRef = useRef<HTMLInputElement | null>(null);
  const [waveformLookup, setWaveformLookup] = useState<Readonly<Record<string, WaveformSummary | null>>>({});

  const mediaCandidates = useMemo<readonly MediaItem[]>(
    (): readonly MediaItem[] => mediaItems.slice(0, 6),
    [mediaItems],
  );
  const audioClipMediaIds = useMemo<readonly string[]>(
    (): readonly string[] =>
      [
        ...new Set(
          clips.flatMap((clip: TimelineClip): readonly string[] =>
            clip.source.audioMetadata.hasAudio ? [clip.source.mediaId] : [],
          ),
        ),
      ],
    [clips],
  );

  useEffect((): (() => void) => {
    let isCancelled = false;

    setWaveformLookup((currentLookup: Readonly<Record<string, WaveformSummary | null>>): Readonly<Record<string, WaveformSummary | null>> =>
      Object.fromEntries(
        Object.entries(currentLookup).filter(([mediaId]): boolean => audioClipMediaIds.includes(mediaId)),
      ),
    );

    if (audioClipMediaIds.length === 0) {
      return (): void => {
        isCancelled = true;
      };
    }

    async function loadWaveforms(): Promise<void> {
      const ensuredAudioContext = audioContext ?? (await ensureAudioContext());

      if (ensuredAudioContext === null || isCancelled) {
        return;
      }

      if (waveformServiceRef.current === null) {
        waveformServiceRef.current = new WaveformAnalysisService({
          decodeAudioData: (audioData: ArrayBuffer): Promise<AudioBuffer> =>
            ensuredAudioContext.decodeAudioData(audioData),
        });
      }

      const waveformService = waveformServiceRef.current;
      const waveformEntries = await Promise.all(
        audioClipMediaIds.map(
          async (mediaId: string): Promise<readonly [string, WaveformSummary | null]> => [
            mediaId,
            await waveformService.getWaveform(mediaId, {
              normalize: true,
              resolution: 192,
            }),
          ],
        ),
      );

      if (isCancelled) {
        return;
      }

      setWaveformLookup((currentLookup: Readonly<Record<string, WaveformSummary | null>>): Readonly<Record<string, WaveformSummary | null>> => ({
        ...currentLookup,
        ...Object.fromEntries(waveformEntries),
      }));
    }

    void loadWaveforms();

    return (): void => {
      isCancelled = true;
    };
  }, [audioClipMediaIds, audioContext, ensureAudioContext]);

  return (
    <Stack spacing={2}>
      <StudioDeckSection
        kicker="Editorial"
        title="Timeline"
        icon={<TimelineRoundedIcon fontSize="small" />}
        actions={
          <Stack direction="row" spacing={0.5}>
            <IconButton color="primary" disabled={!canUndo} onClick={undo} size="small">
              <UndoRoundedIcon fontSize="small" />
            </IconButton>
            <IconButton color="primary" disabled={!canRedo} onClick={redo} size="small">
              <RedoRoundedIcon fontSize="small" />
            </IconButton>
            <IconButton color="primary" onClick={(): Promise<void> => saveCurrentProject()} size="small">
              <SaveRoundedIcon fontSize="small" />
            </IconButton>
          </Stack>
        }
      >
        <Stack spacing={1.25}>
          <TextField
            fullWidth
            label="Project Name"
            onChange={(event): void => renameProject(event.target.value)}
            size="small"
            value={project.name}
          />
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Button onClick={(): void => addTrack('video')} size="small" startIcon={<AddRoundedIcon />}>
              Add Video Track
            </Button>
            <Button onClick={(): void => addTrack('audio')} size="small" startIcon={<AddRoundedIcon />}>
              Add Audio Track
            </Button>
            <Button
              color="error"
              disabled={selectedClip === null || selectedTrackLocked}
              onClick={removeSelectedClip}
              size="small"
              startIcon={<DeleteOutlineRoundedIcon />}
            >
              Remove Clip
            </Button>
          </Stack>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Button
              disabled={selectedClip === null || selectedTrackLocked}
              onClick={splitSelectedClipAtPlayhead}
              size="small"
              startIcon={<ContentCutRoundedIcon />}
            >
              Split at Playhead
            </Button>
            <Button
              disabled={selectedClip === null || selectedTrackLocked}
              onClick={duplicateSelectedClip}
              size="small"
              startIcon={<CopyAllRoundedIcon />}
            >
              Duplicate
            </Button>
            <Button
              disabled={selectedClip === null || selectedTrackLocked}
              onClick={rippleDeleteSelectedClip}
              size="small"
              startIcon={<DeleteOutlineRoundedIcon />}
            >
              Ripple Delete
            </Button>
            <Button
              disabled={selectedTrackId === null || selectedTrackLocked}
              onClick={(): void => insertGapAtPlayhead()}
              size="small"
              startIcon={<AddRoundedIcon />}
            >
              Insert Gap
            </Button>
            <Button
              disabled={selectedTrackId === null || selectedTrackLocked}
              onClick={closeSelectedTrackGaps}
              size="small"
              startIcon={<FormatLineSpacingRoundedIcon />}
            >
              Close Gaps
            </Button>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {isLoading ? 'Loading project…' : `Project ${isDirty ? 'has unsaved edits' : 'is synced'} • Duration ${formatDuration(project.durationMs)}`}
          </Typography>
          {error !== null ? (
            <Typography variant="body2" color="error.main">
              {error}
            </Typography>
          ) : null}
        </Stack>
      </StudioDeckSection>

      <StudioDeckSection kicker="Output" title="Export" icon={<DownloadRoundedIcon fontSize="small" />}>
        <Stack spacing={1}>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          <Button
            disabled={project.durationMs <= 0 || isExporting}
            onClick={(): void => {
              void startExport();
            }}
            size="small"
            startIcon={<DownloadRoundedIcon />}
            variant="contained"
          >
            Export WebM
          </Button>
          <Button
            disabled={!isExporting}
            onClick={cancelExport}
            size="small"
            startIcon={<StopRoundedIcon />}
          >
            Cancel Export
          </Button>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          Export State: {exportState} {isExporting ? `• ${Math.round(exportProgress * 100)}%` : ''}
        </Typography>
        {isExporting ? (
          <LinearProgress
            value={Math.max(0, Math.min(100, exportProgress * 100))}
            variant="determinate"
          />
        ) : null}
        {exportError !== null ? (
          <Typography variant="body2" color="error.main">
            {exportError}
          </Typography>
        ) : null}
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          <Button
            disabled={isPackagingProject}
            onClick={(): void => {
              void exportProjectPackage();
            }}
            size="small"
            startIcon={<DownloadRoundedIcon />}
            variant="outlined"
          >
            Export Package
          </Button>
          <Button
            disabled={isPackagingProject}
            onClick={(): void => {
              packageImportInputRef.current?.click();
            }}
            size="small"
            startIcon={<UploadRoundedIcon />}
            variant="outlined"
          >
            Import Package
          </Button>
          <Button
            disabled={!isPackagingProject}
            onClick={cancelProjectPackage}
            size="small"
            startIcon={<StopRoundedIcon />}
          >
            Cancel Package
          </Button>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          Project packages are manifest-only and preserve timeline state plus referenced media
          descriptors without bundling heavy source binaries into memory.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Package State: {packageState} {isPackagingProject ? `• ${Math.round(packageProgress * 100)}%` : ''}
        </Typography>
        {isPackagingProject ? (
          <LinearProgress
            value={Math.max(0, Math.min(100, packageProgress * 100))}
            variant="determinate"
          />
        ) : null}
        {packageError !== null ? (
          <Typography variant="body2" color="error.main">
            {packageError}
          </Typography>
        ) : null}
        <input
          ref={packageImportInputRef}
          accept=".auteura-project.json,application/json"
          hidden
          onChange={(event): void => {
            const nextFile = event.target.files?.[0];

            if (nextFile !== undefined) {
              void importProjectPackage(nextFile);
            }

            event.currentTarget.value = '';
          }}
          type="file"
        />
        </Stack>
      </StudioDeckSection>

      <StudioDeckSection kicker="Projects" title="Saved Projects" icon={<SaveRoundedIcon fontSize="small" />}>
        <Stack spacing={1}>
        <List
          dense
          disablePadding
          sx={{
            borderRadius: 2,
            overflow: 'hidden',
            border: '1px solid rgba(120, 173, 191, 0.16)',
            background:
              'linear-gradient(180deg, rgba(22, 51, 62, 0.88) 0%, rgba(12, 31, 39, 0.8) 100%)',
          }}
        >
          {projectList.length === 0 ? (
            <StudioEmptyState
              title="No saved projects yet"
              body="As you cut and save work, reusable project snapshots will appear here."
            />
          ) : (
            projectList.map((projectRecord) => (
              <ListItemButton
                key={projectRecord.id}
                onClick={(): Promise<void> => selectProject(projectRecord.id)}
                selected={projectRecord.id === project.id}
              >
                <ListItemText
                  primary={projectRecord.name}
                  secondary={new Date(projectRecord.updatedAt).toLocaleString()}
                />
                <IconButton
                  color="error"
                  edge="end"
                  onClick={(event): void => {
                    event.stopPropagation();
                    void deleteProject(projectRecord.id);
                  }}
                  size="small"
                >
                  <DeleteOutlineRoundedIcon fontSize="small" />
                </IconButton>
              </ListItemButton>
            ))
          )}
        </List>
        </Stack>
      </StudioDeckSection>

      <StudioDeckSection kicker="Playback" title="Timeline Transport" icon={<PlayArrowRoundedIcon fontSize="small" />}>
        <Stack spacing={1}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
          <Typography variant="body2" color="text.secondary">
            Playhead: {formatDuration(playheadMs)}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
            {transportState} • {clockSource === 'audio-master' ? 'Audio Master' : 'System Fallback'}
          </Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          Active layers: {compositionFrame.layers.length} video • {activeAudioNodeCount} audio
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Audio preview: {audioPreviewState}
        </Typography>
        {audioPreviewError !== null ? (
          <Typography variant="caption" color="error.main">
            {audioPreviewError}
          </Typography>
        ) : null}
        <Stack direction="row" spacing={1}>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel id="timeline-preview-mode-label">Preview Source</InputLabel>
            <Select
              label="Preview Source"
              labelId="timeline-preview-mode-label"
              onChange={(event: SelectChangeEvent<'live' | 'timeline'>): void =>
                setPreviewMode(event.target.value as 'live' | 'timeline')
              }
              value={previewMode}
            >
              <MenuItem value="live">Live Camera</MenuItem>
              <MenuItem value="timeline">Timeline Preview</MenuItem>
            </Select>
          </FormControl>
          <Button
            onClick={(): void => {
              void playPlayback();
            }}
            size="small"
            startIcon={<PlayArrowRoundedIcon />}
            variant={isPlaying ? 'outlined' : 'contained'}
          >
            Play
          </Button>
          <Button
            disabled={!isPlaying}
            onClick={pausePlayback}
            size="small"
            startIcon={<PauseRoundedIcon />}
          >
            Pause
          </Button>
          <Button
            disabled={transportState === 'stopped' && playheadMs === 0}
            onClick={stopPlayback}
            size="small"
            startIcon={<StopRoundedIcon />}
          >
            Stop
          </Button>
        </Stack>
        <Slider
          max={Math.max(project.durationMs, 1000)}
          min={0}
          onChange={(_, value): void => {
            if (typeof value === 'number') {
              setPlayheadMs(value);
            }
          }}
          step={100}
          value={Math.min(playheadMs, Math.max(project.durationMs, 1000))}
          valueLabelDisplay="auto"
          valueLabelFormat={(value): string => formatDuration(value)}
        />
        <Typography variant="body2" color="text.secondary">
          Zoom: {zoomLevel.toFixed(1)}x
        </Typography>
        <Slider
          max={8}
          min={0.5}
          onChange={(_, value): void => {
            if (typeof value === 'number') {
              setZoomLevel(value);
            }
          }}
          step={0.1}
          value={zoomLevel}
          valueLabelDisplay="auto"
        />
        </Stack>
      </StudioDeckSection>

      <StudioDeckSection kicker="Sources" title="Source Media" icon={<AddRoundedIcon fontSize="small" />}>
        <Stack spacing={1}>
        {mediaCandidates.length === 0 ? (
          <StudioEmptyState
            title="No source media yet"
            body="Record a clip or capture a still, then add it here to start assembling the timeline."
          />
        ) : (
          mediaCandidates.map((mediaItem: MediaItem) => (
            <Paper
              key={mediaItem.id}
              sx={{
                p: 1.25,
                borderRadius: 3,
                border: '1px solid rgba(120, 173, 191, 0.16)',
                background:
                  'linear-gradient(180deg, rgba(22, 51, 62, 0.88) 0%, rgba(12, 31, 39, 0.8) 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
              }}
              variant="outlined"
            >
              <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center">
                <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                  <Typography variant="body2" noWrap>
                    {mediaItem.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {mediaItem.type} • {formatDuration(mediaItem.durationMs ?? 0)}
                  </Typography>
                </Stack>
                <Button
                  onClick={(): void => addMediaClip(mediaItem)}
                  disabled={selectedTrackLocked}
                  size="small"
                  variant="contained"
                >
                  Add
                </Button>
              </Stack>
            </Paper>
          ))
        )}
        </Stack>
      </StudioDeckSection>

      <StudioDeckSection kicker="Arrangement" title="Tracks" icon={<TimelineRoundedIcon fontSize="small" />}>
        <Stack spacing={1.5}>
        {tracks.map((track: TimelineTrack) => {
          const trackClips = track.clipIds
            .map((clipId: string): TimelineClip | undefined => project.clipLookup[clipId])
            .filter((clip: TimelineClip | undefined): clip is TimelineClip => clip !== undefined);

          return (
            <Paper
              key={track.id}
              onClick={(): void => selectTrack(track.id)}
              sx={{
                p: 1.5,
                borderRadius: 3,
                cursor: 'pointer',
                border: '1px solid',
                borderColor:
                  track.id === selectedTrackId ? 'primary.main' : 'rgba(120, 173, 191, 0.16)',
                bgcolor:
                  track.id === selectedTrackId
                    ? alpha('#c06e28', 0.12)
                    : 'rgba(12, 31, 39, 0.82)',
              }}
            >
              <Stack spacing={1}>
                <Typography variant="body2">
                  {formatTrackLabel(track, trackClips.length)}
                </Typography>
                <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                  <IconButton
                    color={track.muted ? 'warning' : 'default'}
                    onClick={(event): void => {
                      event.stopPropagation();
                      toggleTrackMuted(track.id);
                    }}
                    size="small"
                  >
                    {track.muted ? (
                      <VolumeOffRoundedIcon fontSize="small" />
                    ) : (
                      <VolumeUpRoundedIcon fontSize="small" />
                    )}
                  </IconButton>
                  <IconButton
                    color={track.solo ? 'primary' : 'default'}
                    onClick={(event): void => {
                      event.stopPropagation();
                      toggleTrackSolo(track.id);
                    }}
                    size="small"
                  >
                    <SurroundSoundRoundedIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    color={track.locked ? 'error' : 'default'}
                    onClick={(event): void => {
                      event.stopPropagation();
                      toggleTrackLocked(track.id);
                    }}
                    size="small"
                  >
                    {track.locked ? (
                      <LockRoundedIcon fontSize="small" />
                    ) : (
                      <LockOpenRoundedIcon fontSize="small" />
                    )}
                  </IconButton>
                  <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                    {track.muted ? 'Muted' : 'Live'}
                    {track.solo ? ' • Solo' : ''}
                    {track.locked ? ' • Locked' : ''}
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  {trackClips.length === 0 ? (
                    <Typography variant="caption" color="text.secondary">
                      No clips on this track yet.
                    </Typography>
                  ) : (
                    trackClips.map((clip: TimelineClip) => (
                      <Button
                        key={clip.id}
                        onClick={(event): void => {
                          event.stopPropagation();
                          selectClip(clip.id);
                        }}
                        size="small"
                        sx={{
                          justifyContent: 'flex-start',
                          alignItems: 'stretch',
                          px: 1.25,
                          py: 0.75,
                          borderRadius: 999,
                          border: '1px solid',
                          borderColor:
                            clip.id === selectedClip?.id ? 'primary.main' : 'rgba(120, 173, 191, 0.16)',
                          bgcolor:
                            clip.id === selectedClip?.id
                              ? alpha('#c06e28', 0.18)
                              : 'rgba(20, 44, 54, 0.9)',
                          opacity: track.muted && !track.solo ? 0.55 : 1,
                          minWidth: Math.max(120, Math.round((clip.durationMs / 1000) * 56 * zoomLevel)),
                        }}
                        variant="text"
                      >
                        <Stack spacing={0.5} sx={{ width: '100%', minWidth: 0 }}>
                          <Typography variant="caption" noWrap sx={{ textAlign: 'left' }}>
                            {clip.label}
                          </Typography>
                          {clip.source.audioMetadata.hasAudio ? (
                            <TimelineWaveform
                              loading={waveformLookup[clip.source.mediaId] === undefined}
                              summary={waveformLookup[clip.source.mediaId]}
                              trimEndMs={clip.trimEndMs}
                              trimStartMs={clip.trimStartMs}
                            />
                          ) : null}
                          <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'left' }}>
                            {formatDuration(clip.durationMs)}
                          </Typography>
                        </Stack>
                      </Button>
                    ))
                  )}
                </Stack>
              </Stack>
            </Paper>
          );
        })}
        </Stack>
      </StudioDeckSection>

      {selectedClip !== null ? (
        <StudioDeckSection kicker="Inspector" title="Selected Clip" icon={<ContentCutRoundedIcon fontSize="small" />}>
          <Stack spacing={1}>
            <Typography variant="body2">{selectedClip.label}</Typography>
            <Typography variant="body2" color="text.secondary">
              Starts at {formatDuration(selectedClip.startMs)} • Duration {formatDuration(selectedClip.durationMs)}
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <Button disabled={selectedTrackLocked} onClick={(): void => moveSelectedClipBy(-500)} size="small" variant="outlined">
                Move -0.5s
              </Button>
              <Button disabled={selectedTrackLocked} onClick={(): void => moveSelectedClipBy(500)} size="small" variant="outlined">
                Move +0.5s
              </Button>
              <Button disabled={selectedTrackLocked} onClick={(): void => trimSelectedClipBy(-500)} size="small" variant="outlined">
                Trim -0.5s
              </Button>
              <Button disabled={selectedTrackLocked} onClick={(): void => trimSelectedClipBy(500)} size="small" variant="outlined">
                Trim +0.5s
              </Button>
            </Stack>
            {selectedClip.source.audioMetadata.hasAudio ? (
              <AudioInspectorPanel
                clip={selectedClip}
                disabled={selectedTrackLocked}
                onUpdateAudioEnvelope={updateSelectedClipAudioEnvelope}
                onUpdateAudioSettings={updateSelectedClipAudioSettings}
              />
            ) : null}
          </Stack>
        </StudioDeckSection>
      ) : null}

      <Typography variant="caption" color="text.secondary">
        {clips.length} total clip{clips.length === 1 ? '' : 's'} across {tracks.length} track{tracks.length === 1 ? '' : 's'}.
      </Typography>
    </Stack>
  );
}
