import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import type {
  TimelineClip,
  TimelineEnvelopePoint,
} from '../models/Timeline';

type TimelineAudioEnvelopeKind = 'pan' | 'volume';

interface AudioInspectorPanelProps {
  readonly clip: TimelineClip;
  readonly disabled: boolean;
  readonly onUpdateAudioEnvelope: (
    envelopeKind: TimelineAudioEnvelopeKind,
    nextPoints: readonly TimelineEnvelopePoint[],
  ) => void;
  readonly onUpdateAudioSettings: (
    nextSettings: Partial<TimelineClip['audio']>,
  ) => void;
}

function formatMilliseconds(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(2)}s`;
}

function buildEnvelopePoint(
  envelopeKind: TimelineAudioEnvelopeKind,
  clip: TimelineClip,
): TimelineEnvelopePoint {
  return {
    timeMs: Math.round(clip.durationMs / 2),
    value: envelopeKind === 'pan' ? 0 : 1,
  };
}

function updateEnvelopePoint(
  points: readonly TimelineEnvelopePoint[],
  pointIndex: number,
  nextPoint: TimelineEnvelopePoint,
): readonly TimelineEnvelopePoint[] {
  return points.map((point: TimelineEnvelopePoint, index: number): TimelineEnvelopePoint =>
    index === pointIndex ? nextPoint : point,
  );
}

function removeEnvelopePoint(
  points: readonly TimelineEnvelopePoint[],
  pointIndex: number,
): readonly TimelineEnvelopePoint[] {
  return points.filter(
    (_point: TimelineEnvelopePoint, index: number): boolean => index !== pointIndex,
  );
}

interface EnvelopeEditorProps {
  readonly clip: TimelineClip;
  readonly disabled: boolean;
  readonly envelopeKind: TimelineAudioEnvelopeKind;
  readonly points: readonly TimelineEnvelopePoint[];
  readonly valueLabel: string;
  readonly valueRange: readonly [number, number];
  readonly onChange: (nextPoints: readonly TimelineEnvelopePoint[]) => void;
}

function EnvelopeEditor({
  clip,
  disabled,
  envelopeKind,
  points,
  valueLabel,
  valueRange,
  onChange,
}: EnvelopeEditorProps): JSX.Element {
  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
        <Typography variant="caption" color="text.secondary">
          {valueLabel} Envelope
        </Typography>
        <Button
          disabled={disabled}
          onClick={(): void => onChange([...points, buildEnvelopePoint(envelopeKind, clip)])}
          size="small"
          startIcon={<AddRoundedIcon fontSize="small" />}
        >
          Add Point
        </Button>
      </Stack>
      {points.length === 0 ? (
        <Typography variant="caption" color="text.secondary">
          No automation points yet.
        </Typography>
      ) : (
        points.map((point: TimelineEnvelopePoint, pointIndex: number) => (
          <Stack
            key={`${envelopeKind}-${pointIndex}-${point.timeMs}`}
            spacing={0.75}
            sx={{
              p: 1,
              borderRadius: 3,
              border: '1px solid rgba(15, 79, 99, 0.08)',
              bgcolor: alpha('#fffaf4', 0.72),
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
              <Typography variant="caption" color="text.secondary">
                Point {pointIndex + 1} • {formatMilliseconds(point.timeMs)}
              </Typography>
              <IconButton
                disabled={disabled}
                onClick={(): void => onChange(removeEnvelopePoint(points, pointIndex))}
                size="small"
              >
                <DeleteOutlineRoundedIcon fontSize="small" />
              </IconButton>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Time
            </Typography>
            <Slider
              disabled={disabled}
              max={clip.durationMs}
              min={0}
              onChange={(_event, nextValue): void => {
                if (typeof nextValue !== 'number') {
                  return;
                }

                onChange(
                  updateEnvelopePoint(points, pointIndex, {
                    ...point,
                    timeMs: nextValue,
                  }),
                );
              }}
              step={50}
              value={Math.max(0, Math.min(clip.durationMs, point.timeMs))}
              valueLabelDisplay="auto"
              valueLabelFormat={(value: number): string => formatMilliseconds(value)}
            />
            <Typography variant="caption" color="text.secondary">
              {valueLabel}
            </Typography>
            <Slider
              disabled={disabled}
              max={valueRange[1]}
              min={valueRange[0]}
              onChange={(_event, nextValue): void => {
                if (typeof nextValue !== 'number') {
                  return;
                }

                onChange(
                  updateEnvelopePoint(points, pointIndex, {
                    ...point,
                    value: nextValue,
                  }),
                );
              }}
              step={0.01}
              value={Math.max(valueRange[0], Math.min(valueRange[1], point.value))}
              valueLabelDisplay="auto"
            />
          </Stack>
        ))
      )}
    </Stack>
  );
}

export function AudioInspectorPanel({
  clip,
  disabled,
  onUpdateAudioEnvelope,
  onUpdateAudioSettings,
}: AudioInspectorPanelProps): JSX.Element {
  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle2">Audio Inspector</Typography>
      <FormControlLabel
        control={
          <Switch
            checked={!clip.audio.muted}
            disabled={disabled}
            onChange={(_event, checked): void => {
              onUpdateAudioSettings({
                muted: !checked,
              });
            }}
          />
        }
        label={clip.audio.muted ? 'Clip audio muted' : 'Clip audio enabled'}
      />
      <Typography variant="caption" color="text.secondary">
        Gain
      </Typography>
      <Slider
        disabled={disabled}
        max={2}
        min={0}
        onChange={(_event, nextValue): void => {
          if (typeof nextValue !== 'number') {
            return;
          }

          onUpdateAudioSettings({
            gain: nextValue,
          });
        }}
        step={0.01}
        value={clip.audio.gain}
        valueLabelDisplay="auto"
      />
      <Typography variant="caption" color="text.secondary">
        Pan
      </Typography>
      <Slider
        disabled={disabled}
        marks={[
          { value: -1, label: 'L' },
          { value: 0, label: 'C' },
          { value: 1, label: 'R' },
        ]}
        max={1}
        min={-1}
        onChange={(_event, nextValue): void => {
          if (typeof nextValue !== 'number') {
            return;
          }

          onUpdateAudioSettings({
            pan: nextValue,
          });
        }}
        step={0.01}
        value={clip.audio.pan}
        valueLabelDisplay="auto"
      />
      <Typography variant="caption" color="text.secondary">
        Fade In
      </Typography>
      <Slider
        disabled={disabled}
        max={clip.durationMs}
        min={0}
        onChange={(_event, nextValue): void => {
          if (typeof nextValue !== 'number') {
            return;
          }

          onUpdateAudioSettings({
            fadeInMs: nextValue,
          });
        }}
        step={50}
        value={clip.audio.fadeInMs}
        valueLabelDisplay="auto"
        valueLabelFormat={(value: number): string => formatMilliseconds(value)}
      />
      <Typography variant="caption" color="text.secondary">
        Fade Out
      </Typography>
      <Slider
        disabled={disabled}
        max={clip.durationMs}
        min={0}
        onChange={(_event, nextValue): void => {
          if (typeof nextValue !== 'number') {
            return;
          }

          onUpdateAudioSettings({
            fadeOutMs: nextValue,
          });
        }}
        step={50}
        value={clip.audio.fadeOutMs}
        valueLabelDisplay="auto"
        valueLabelFormat={(value: number): string => formatMilliseconds(value)}
      />
      <EnvelopeEditor
        clip={clip}
        disabled={disabled}
        envelopeKind="volume"
        onChange={(nextPoints: readonly TimelineEnvelopePoint[]): void => {
          onUpdateAudioEnvelope('volume', nextPoints);
        }}
        points={clip.audio.volumeEnvelope}
        valueLabel="Volume"
        valueRange={[0, 2]}
      />
      <EnvelopeEditor
        clip={clip}
        disabled={disabled}
        envelopeKind="pan"
        onChange={(nextPoints: readonly TimelineEnvelopePoint[]): void => {
          onUpdateAudioEnvelope('pan', nextPoints);
        }}
        points={clip.audio.panEnvelope}
        valueLabel="Pan"
        valueRange={[-1, 1]}
      />
    </Stack>
  );
}
