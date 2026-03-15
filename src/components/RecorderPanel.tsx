import FiberManualRecordRoundedIcon from '@mui/icons-material/FiberManualRecordRounded';
import PhotoCameraRoundedIcon from '@mui/icons-material/PhotoCameraRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import BurstModeRoundedIcon from '@mui/icons-material/BurstModeRounded';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import BookmarkAddRoundedIcon from '@mui/icons-material/BookmarkAddRounded';
import { alpha } from '@mui/material/styles';
import type { SelectChangeEvent } from '@mui/material/Select';
import { useMemo, useState } from 'react';
import { StudioDeckSection } from './StudioDeckSection';
import { useRecordingController } from '../controllers/RecordingController';

function formatRecordingTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, '0');
  const minutes = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, '0');

  return `${hours}:${minutes}:${seconds}`;
}

export function RecorderPanel(): JSX.Element {
  const {
    applyCapturePreset,
    availableCapturePresets,
    availableProfiles,
    burstCount,
    captureBurst,
    capturePhoto,
    countdownRemaining,
    countdownSeconds,
    deleteUserCapturePreset,
    error,
    isBurstCapturing,
    isCountingDown,
    isProcessingCapture,
    isRecording,
    isTimelapseCapturing,
    mediaItems,
    recordingTime,
    saveCurrentCapturePreset,
    selectedCapturePresetId,
    selectedProfileId,
    setBurstCount,
    setCountdownSeconds,
    setStillImageFormat,
    setRecordingProfileId,
    setTimelapseIntervalSeconds,
    setTimelapseMaxShots,
    startRecording,
    startTimelapseCapture,
    stillImageFormat,
    stopRecording,
    stopTimelapseCapture,
    storageStats,
    timelapseIntervalSeconds,
    timelapseMaxShots,
    timelapseShotsCaptured,
    timelapseState,
  } = useRecordingController();
  const [capturePresetName, setCapturePresetName] = useState<string>('');

  const formattedRecordingTime = useMemo<string>(
    (): string => formatRecordingTime(recordingTime),
    [recordingTime],
  );
  const activeCapturePreset = useMemo(
    () =>
      availableCapturePresets.find((preset): boolean => preset.id === selectedCapturePresetId) ?? null,
    [availableCapturePresets, selectedCapturePresetId],
  );
  const storageUsageRatio = useMemo<number | null>(
    (): number | null => {
      if (storageStats === null || storageStats.maxAllowedBytes === null) {
        return null;
      }

      return storageStats.usageBytes / storageStats.maxAllowedBytes;
    },
    [storageStats],
  );
  const sessionSummary = useMemo<string>(() => {
    const profileLabel =
      availableProfiles.find((profile): boolean => profile.id === selectedProfileId)?.label ??
      'Balanced';
    const timelapseSummary =
      timelapseMaxShots === null
        ? `${timelapseIntervalSeconds}s continuous`
        : `${timelapseIntervalSeconds}s x ${timelapseMaxShots}`;

    return `${profileLabel} capture • ${stillImageFormat === 'image/png' ? 'PNG stills' : 'WEBP stills'} • Timelapse ${timelapseSummary}`;
  }, [
    availableProfiles,
    selectedProfileId,
    stillImageFormat,
    timelapseIntervalSeconds,
    timelapseMaxShots,
  ]);
  const storageTone = storageUsageRatio !== null && storageUsageRatio >= 0.85 ? '#b5522f' : '#0e5970';

  return (
    <Stack spacing={2}>
      <StudioDeckSection
        kicker="Capture"
        title="Recorder"
        icon={<FiberManualRecordRoundedIcon fontSize="small" />}
      >
        <Stack spacing={1.5}>
          {error !== null ? <Alert severity="warning">{error}</Alert> : null}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.2} alignItems={{ sm: 'flex-end' }}>
            <FormControl fullWidth size="small">
              <InputLabel id="capture-preset-label">Capture Preset</InputLabel>
              <Select
                label="Capture Preset"
                labelId="capture-preset-label"
                value={selectedCapturePresetId ?? 'custom'}
                onChange={(event: SelectChangeEvent<string>): void => {
                  const nextValue = event.target.value;
                  if (nextValue !== 'custom') {
                    applyCapturePreset(nextValue);
                  }
                }}
              >
                <MenuItem value="custom">Custom</MenuItem>
                {availableCapturePresets.map(
                  (preset): JSX.Element => (
                    <MenuItem key={preset.id} value={preset.id}>
                      {preset.label}
                      {preset.isBundled ? ' · Bundled' : ' · Saved'}
                    </MenuItem>
                  ),
                )}
              </Select>
            </FormControl>
            <TextField
              fullWidth
              size="small"
              label="Save Current As"
              value={capturePresetName}
              onChange={(event): void => {
                setCapturePresetName(event.target.value);
              }}
            />
            <Button
              startIcon={<BookmarkAddRoundedIcon />}
              variant="outlined"
              onClick={(): void => {
                void saveCurrentCapturePreset(capturePresetName)
                  .then((): void => {
                    setCapturePresetName('');
                  })
                  .catch((): void => {
                    // Controller error state surfaces the failure.
                  });
              }}
            >
              Save
            </Button>
            {activeCapturePreset !== null && !activeCapturePreset.isBundled ? (
              <IconButton
                aria-label="Delete capture preset"
                color="default"
                onClick={(): void => {
                  void deleteUserCapturePreset(activeCapturePreset.id);
                }}
              >
                <DeleteOutlineRoundedIcon fontSize="small" />
              </IconButton>
            ) : null}
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {activeCapturePreset?.description ??
              'Save the current recorder setup as a reusable preset.'}
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
              gap: 0.9,
            }}
          >
            <Box
              sx={{
                p: 1,
                borderRadius: 3,
                bgcolor: alpha('#0e5970', 0.06),
                textAlign: 'center',
              }}
            >
              <Typography variant="overline" sx={{ color: 'secondary.dark', display: 'block', mb: 0.2 }}>
                Status
              </Typography>
              <Typography variant="body2">
                {isRecording
                  ? 'Recording live output'
                  : isTimelapseCapturing
                    ? timelapseState === 'paused-hidden'
                      ? 'Paused while tab is hidden'
                      : 'Capturing interval stills'
                  : isCountingDown
                    ? `Countdown ${countdownRemaining}`
                    : isProcessingCapture
                      ? 'Preparing capture'
                      : 'Idle'}
              </Typography>
            </Box>
            <Box
              sx={{
                p: 1,
                borderRadius: 3,
                bgcolor: alpha('#c06e28', 0.08),
                textAlign: 'center',
              }}
            >
              <Typography variant="overline" sx={{ color: 'secondary.dark', display: 'block', mb: 0.2 }}>
                Timer
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  fontVariantNumeric: 'tabular-nums',
                  color: isRecording ? 'error.main' : 'text.primary',
                }}
              >
                {formattedRecordingTime}
              </Typography>
            </Box>
            <Box
              sx={{
                p: 1,
                borderRadius: 3,
                bgcolor: alpha('#0e5970', 0.06),
                textAlign: 'center',
              }}
            >
              <Typography variant="overline" sx={{ color: 'secondary.dark', display: 'block', mb: 0.2 }}>
                Library
              </Typography>
              <Typography variant="body2">{mediaItems.length} saved capture{mediaItems.length === 1 ? '' : 's'}</Typography>
            </Box>
            <Box
              sx={{
                p: 1,
                borderRadius: 3,
                bgcolor: alpha(storageTone, 0.08),
                textAlign: 'center',
              }}
            >
              <Typography variant="overline" sx={{ color: 'secondary.dark', display: 'block', mb: 0.2 }}>
                Storage
              </Typography>
              <Typography variant="body2">
                {storageStats === null
                  ? 'Scanning'
                  : `${(storageStats.usageBytes / (1024 * 1024)).toFixed(1)} MB`}
              </Typography>
            </Box>
          </Box>
          <Box
            sx={{
              px: 1.25,
              py: 0.95,
              borderRadius: 3,
              border: '1px solid rgba(15, 79, 99, 0.08)',
              backgroundColor: alpha('#fffaf4', 0.76),
            }}
          >
            <Typography variant="overline" sx={{ color: 'secondary.dark', display: 'block', mb: 0.15 }}>
              Session Plan
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {sessionSummary}
            </Typography>
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <FormControl fullWidth size="small">
              <InputLabel id="recording-profile-label">Recording Profile</InputLabel>
              <Select
                label="Recording Profile"
                labelId="recording-profile-label"
                value={selectedProfileId}
                onChange={(event: SelectChangeEvent<string>): void =>
                  setRecordingProfileId(event.target.value)
                }
              >
                {availableProfiles.map(
                  (profile): JSX.Element => (
                    <MenuItem key={profile.id} value={profile.id}>
                      {profile.label}
                    </MenuItem>
                  ),
                )}
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel id="countdown-seconds-label">Countdown</InputLabel>
              <Select
                label="Countdown"
                labelId="countdown-seconds-label"
                value={countdownSeconds.toString()}
                onChange={(event: SelectChangeEvent<string>): void =>
                  setCountdownSeconds(Number(event.target.value))
                }
              >
                <MenuItem value="0">Off</MenuItem>
                <MenuItem value="3">3 seconds</MenuItem>
                <MenuItem value="5">5 seconds</MenuItem>
                <MenuItem value="10">10 seconds</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel id="burst-count-label">Burst Count</InputLabel>
              <Select
                label="Burst Count"
                labelId="burst-count-label"
                value={burstCount.toString()}
                onChange={(event: SelectChangeEvent<string>): void =>
                  setBurstCount(Number(event.target.value))
                }
              >
                <MenuItem value="1">1 frame</MenuItem>
                <MenuItem value="3">3 frames</MenuItem>
                <MenuItem value="5">5 frames</MenuItem>
                <MenuItem value="7">7 frames</MenuItem>
                <MenuItem value="9">9 frames</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel id="still-format-label">Still Format</InputLabel>
              <Select
                label="Still Format"
                labelId="still-format-label"
                value={stillImageFormat}
                onChange={(event: SelectChangeEvent<string>): void =>
                  setStillImageFormat(event.target.value as 'image/png' | 'image/webp')
                }
              >
                <MenuItem value="image/webp">WEBP</MenuItem>
                <MenuItem value="image/png">PNG</MenuItem>
              </Select>
            </FormControl>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <FormControl fullWidth size="small">
              <InputLabel id="timelapse-interval-label">Timelapse Interval</InputLabel>
              <Select
                label="Timelapse Interval"
                labelId="timelapse-interval-label"
                value={timelapseIntervalSeconds.toString()}
                onChange={(event: SelectChangeEvent<string>): void =>
                  setTimelapseIntervalSeconds(Number(event.target.value))
                }
              >
                <MenuItem value="1">1 second</MenuItem>
                <MenuItem value="3">3 seconds</MenuItem>
                <MenuItem value="5">5 seconds</MenuItem>
                <MenuItem value="10">10 seconds</MenuItem>
                <MenuItem value="30">30 seconds</MenuItem>
                <MenuItem value="60">1 minute</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel id="timelapse-max-shots-label">Session Length</InputLabel>
              <Select
                label="Session Length"
                labelId="timelapse-max-shots-label"
                value={timelapseMaxShots === null ? 'unlimited' : timelapseMaxShots.toString()}
                onChange={(event: SelectChangeEvent<string>): void => {
                  const nextValue = event.target.value;
                  setTimelapseMaxShots(nextValue === 'unlimited' ? null : Number(nextValue));
                }}
              >
                <MenuItem value="unlimited">No limit</MenuItem>
                <MenuItem value="12">12 shots</MenuItem>
                <MenuItem value="30">30 shots</MenuItem>
                <MenuItem value="60">60 shots</MenuItem>
                <MenuItem value="120">120 shots</MenuItem>
              </Select>
            </FormControl>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {
              availableProfiles.find((profile): boolean => profile.id === selectedProfileId)?.description
            }
          </Typography>
          {storageUsageRatio !== null && storageUsageRatio >= 0.85 ? (
            <Alert severity="warning">
              Browser storage is nearly full. Prefer linked imports in the media library and export
              recordings promptly.
            </Alert>
          ) : null}
          <Alert severity={timelapseState === 'paused-hidden' ? 'warning' : 'info'}>
            Timelapse capture pauses when this tab is hidden or minimized. When you return, the
            session resumes from the current time and does not backfill missed frames.
          </Alert>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <Button
              color={isRecording ? 'error' : 'primary'}
              disabled={(isProcessingCapture && !isRecording) || isTimelapseCapturing}
              onClick={isRecording ? stopRecording : (): void => void startRecording()}
              startIcon={isRecording ? <StopRoundedIcon /> : <FiberManualRecordRoundedIcon />}
              variant="contained"
            >
              {isRecording ? 'Stop Recording' : 'Start Recording'}
            </Button>
            <Button
              color="inherit"
              disabled={isRecording || isProcessingCapture || isTimelapseCapturing}
              onClick={(): void => void capturePhoto()}
              startIcon={<PhotoCameraRoundedIcon />}
              variant="outlined"
            >
              Capture Photo
            </Button>
            <Button
              color="inherit"
              disabled={isRecording || isProcessingCapture || isTimelapseCapturing}
              onClick={(): void => void captureBurst()}
              startIcon={<BurstModeRoundedIcon />}
              variant="outlined"
            >
              {isBurstCapturing ? 'Burst Running' : `Burst x${burstCount}`}
            </Button>
            <Button
              color={timelapseState === 'paused-hidden' ? 'warning' : 'inherit'}
              disabled={isRecording || (isProcessingCapture && !isTimelapseCapturing)}
              onClick={
                isTimelapseCapturing
                  ? stopTimelapseCapture
                  : (): void => void startTimelapseCapture()
              }
              startIcon={isTimelapseCapturing ? <StopRoundedIcon /> : <ScheduleRoundedIcon />}
              variant={isTimelapseCapturing ? 'contained' : 'outlined'}
            >
              {isTimelapseCapturing
                ? `Stop Timelapse (${timelapseShotsCaptured})`
                : 'Start Timelapse'}
            </Button>
          </Stack>
          {storageStats !== null ? (
            <Box
              sx={{
                px: 1.5,
                py: 1,
                borderRadius: 3,
                border: '1px solid rgba(15, 79, 99, 0.08)',
                backgroundColor: alpha('#fffaf4', 0.8),
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                Storage usage: {(storageStats.usageBytes / (1024 * 1024)).toFixed(1)} MB
                {storageStats.maxAllowedBytes !== null
                  ? ` / ${(storageStats.maxAllowedBytes / (1024 * 1024)).toFixed(1)} MB`
                  : ''}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {storageStats.handleBackedItemCount > 0
                  ? `${storageStats.handleBackedItemCount} linked import${
                      storageStats.handleBackedItemCount === 1 ? '' : 's'
                    } keep large source files out of browser storage.`
                  : 'All saved captures are currently stored inside browser storage.'}
              </Typography>
            </Box>
          ) : null}
        </Stack>
      </StudioDeckSection>
    </Stack>
  );
}
