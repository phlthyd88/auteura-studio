import GraphicEqRoundedIcon from '@mui/icons-material/GraphicEqRounded';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import { useAudioContext } from '../context/AudioContext';
import { StudioDeckSection } from './StudioDeckSection';

function formatDbfs(value: number | null): string {
  if (value === null) {
    return '−inf dB';
  }

  return `${value.toFixed(1)} dB`;
}

function MeterBar({
  color,
  label,
  peak,
  rms,
}: {
  readonly color: string;
  readonly label: string;
  readonly peak: number;
  readonly rms: number;
}): JSX.Element {
  return (
    <Stack spacing={0.6} sx={{ minWidth: 0 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {Math.round(peak * 100)}%
        </Typography>
      </Stack>
      <Box
        sx={{
          height: 10,
          borderRadius: 999,
          overflow: 'hidden',
          bgcolor: 'rgba(255,255,255,0.06)',
          position: 'relative',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            width: `${Math.max(3, rms * 100)}%`,
            bgcolor: alpha(color, 0.42),
            transition: 'width 90ms linear',
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            width: `${Math.max(3, peak * 100)}%`,
            background: `linear-gradient(90deg, ${alpha(color, 0.72)} 0%, ${color} 100%)`,
            borderRight: '1px solid rgba(255,250,244,0.85)',
            transition: 'width 60ms linear',
          }}
        />
      </Box>
    </Stack>
  );
}

function MeterBlock({
  accentColor,
  availableLabel,
  description,
  title,
  meter,
}: {
  readonly accentColor: string;
  readonly availableLabel: string;
  readonly description: string;
  readonly meter: ReturnType<typeof useAudioContext>['audioMeters']['liveInput'];
  readonly title: string;
}): JSX.Element {
  const theme = useTheme();

  return (
    <Box
      sx={{
        p: 1.4,
        borderRadius: '20px',
        border: `1px solid ${alpha(theme.palette.auteura.borderSubtle, 0.96)}`,
        background: `linear-gradient(180deg, ${alpha(theme.palette.auteura.surfaceElevated, 0.88)} 0%, ${alpha(
          theme.palette.auteura.surface,
          0.8,
        )} 100%)`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
      }}
    >
      <Stack spacing={1}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
          <Box>
            <Typography variant="subtitle2">{title}</Typography>
            <Typography variant="caption" color="text.secondary">
              {description}
            </Typography>
          </Box>
          <Typography
            variant="caption"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              px: 0.9,
              py: 0.35,
              borderRadius: 999,
              minWidth: 118,
              whiteSpace: 'nowrap',
              bgcolor: meter.active
                ? alpha(accentColor, 0.14)
                : alpha(theme.palette.auteura.surfaceElevated, 0.72),
              color: meter.active ? accentColor : 'text.secondary',
              border: `1px solid ${alpha(
                meter.active ? accentColor : theme.palette.auteura.borderSubtle,
                meter.active ? 0.24 : 0.92,
              )}`,
            }}
          >
            {meter.active ? 'Live' : availableLabel}
          </Typography>
        </Stack>
        <MeterBar
          color={accentColor}
          label="L"
          peak={meter.channels[0]?.peak ?? 0}
          rms={meter.channels[0]?.rms ?? 0}
        />
        <MeterBar
          color={accentColor}
          label="R"
          peak={meter.channels[1]?.peak ?? meter.channels[0]?.peak ?? 0}
          rms={meter.channels[1]?.rms ?? meter.channels[0]?.rms ?? 0}
        />
        <Typography variant="caption" color="text.secondary">
          Peak {formatDbfs(meter.peakDbfs)} • RMS {formatDbfs(meter.rmsDbfs)}
        </Typography>
      </Stack>
    </Box>
  );
}

export function AudioMeters(): JSX.Element {
  const { audioMeters } = useAudioContext();

  return (
    <StudioDeckSection
      kicker="Monitoring"
      title="Audio Meters"
      icon={<GraphicEqRoundedIcon fontSize="small" />}
    >
      <Stack spacing={1.15}>
        <MeterBlock
          accentColor="#20c2c5"
          availableLabel="Awaiting input"
          description="Microphone routed to record bus without local speaker monitoring."
          meter={audioMeters.liveInput}
          title="Live Input"
        />
        <MeterBlock
          accentColor="#c06e28"
          availableLabel="Idle"
          description="Timeline playback bus feeding preview monitoring and recording."
          meter={audioMeters.timelinePlayback}
          title="Timeline Playback"
        />
      </Stack>
    </StudioDeckSection>
  );
}
