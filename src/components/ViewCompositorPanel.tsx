import PictureInPictureAltRoundedIcon from '@mui/icons-material/PictureInPictureAltRounded';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Typography from '@mui/material/Typography';
import { StudioDeckSection } from './StudioDeckSection';
import { useRenderController } from '../controllers/RenderController';
import type {
  CompositorSecondarySource,
  PictureInPictureAnchor,
} from '../types/compositor';

export function ViewCompositorPanel(): JSX.Element {
  const { pictureInPictureConfig, setPictureInPictureConfig } = useRenderController();

  return (
    <StudioDeckSection
      kicker="Compositor"
      title="Picture in Picture"
      icon={<PictureInPictureAltRoundedIcon fontSize="small" />}
    >
      <Stack spacing={1.5}>
        <FormControlLabel
          control={
            <Switch
              checked={pictureInPictureConfig.enabled}
              onChange={(event): void =>
                setPictureInPictureConfig({
                  ...pictureInPictureConfig,
                  enabled: event.target.checked,
                })
              }
            />
          }
          label="Enable PiP"
        />
        <FormControl fullWidth size="small">
          <InputLabel id="pip-source-label">Source</InputLabel>
          <Select
            label="Source"
            labelId="pip-source-label"
            value={pictureInPictureConfig.source}
            onChange={(event): void =>
              setPictureInPictureConfig({
                ...pictureInPictureConfig,
                source: event.target.value as CompositorSecondarySource,
              })
            }
          >
            <MenuItem value="original-camera">Original Camera</MenuItem>
            <MenuItem value="processed-output">Processed Output</MenuItem>
          </Select>
        </FormControl>
        <FormControl fullWidth size="small">
          <InputLabel id="pip-anchor-label">Anchor</InputLabel>
          <Select
            label="Anchor"
            labelId="pip-anchor-label"
            value={pictureInPictureConfig.anchor}
            onChange={(event): void =>
              setPictureInPictureConfig({
                ...pictureInPictureConfig,
                anchor: event.target.value as PictureInPictureAnchor,
              })
            }
          >
            <MenuItem value="top-left">Top Left</MenuItem>
            <MenuItem value="top-right">Top Right</MenuItem>
            <MenuItem value="bottom-left">Bottom Left</MenuItem>
            <MenuItem value="bottom-right">Bottom Right</MenuItem>
          </Select>
        </FormControl>
        <Stack spacing={1}>
          <Typography variant="body2" color="text.secondary">
            Size: {Math.round(pictureInPictureConfig.size * 100)}%
          </Typography>
          <Slider
            min={0.12}
            max={0.45}
            step={0.01}
            value={pictureInPictureConfig.size}
            onChange={(_, value): void => {
              if (typeof value !== 'number') {
                return;
              }

              setPictureInPictureConfig({
                ...pictureInPictureConfig,
                size: value,
              });
            }}
            valueLabelDisplay="auto"
            valueLabelFormat={(value): string => `${Math.round(value * 100)}%`}
          />
        </Stack>
        <Stack spacing={1}>
          <Typography variant="body2" color="text.secondary">
            Inset: {Math.round(pictureInPictureConfig.inset * 100)}%
          </Typography>
          <Slider
            min={0.01}
            max={0.12}
            step={0.005}
            value={pictureInPictureConfig.inset}
            onChange={(_, value): void => {
              if (typeof value !== 'number') {
                return;
              }

              setPictureInPictureConfig({
                ...pictureInPictureConfig,
                inset: value,
              });
            }}
            valueLabelDisplay="auto"
            valueLabelFormat={(value): string => `${Math.round(value * 100)}%`}
          />
        </Stack>
        <Stack spacing={1}>
          <Typography variant="body2" color="text.secondary">
            Opacity: {Math.round(pictureInPictureConfig.opacity * 100)}%
          </Typography>
          <Slider
            min={0.2}
            max={1}
            step={0.05}
            value={pictureInPictureConfig.opacity}
            onChange={(_, value): void => {
              if (typeof value !== 'number') {
                return;
              }

              setPictureInPictureConfig({
                ...pictureInPictureConfig,
                opacity: value,
              });
            }}
            valueLabelDisplay="auto"
            valueLabelFormat={(value): string => `${Math.round(value * 100)}%`}
          />
        </Stack>
        <FormControlLabel
          control={
            <Switch
              checked={pictureInPictureConfig.showBorder}
              onChange={(event): void =>
                setPictureInPictureConfig({
                  ...pictureInPictureConfig,
                  showBorder: event.target.checked,
                })
              }
            />
          }
          label="Show border"
        />
      </Stack>
    </StudioDeckSection>
  );
}
