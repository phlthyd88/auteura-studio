import AutoFixHighRoundedIcon from '@mui/icons-material/AutoFixHighRounded';
import FormControlLabel from '@mui/material/FormControlLabel';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { StudioDeckSection } from './StudioDeckSection';
import { useRenderController } from '../controllers/RenderController';

export function ViewMaskPanel(): JSX.Element {
  const { maskRefinementConfig, setMaskRefinementConfig } = useRenderController();

  return (
    <StudioDeckSection
      kicker="Segmentation"
      title="Mask Refinement"
      icon={<AutoFixHighRoundedIcon fontSize="small" />}
    >
      <Stack spacing={1.5}>
        <FormControlLabel
          control={
            <Switch
              checked={maskRefinementConfig.enabled}
              onChange={(event): void =>
                setMaskRefinementConfig({
                  ...maskRefinementConfig,
                  enabled: event.target.checked,
                })
              }
            />
          }
          label="Enable refinement"
        />
        <Stack spacing={1}>
          <Typography variant="body2" color="text.secondary">
            Threshold: {maskRefinementConfig.threshold.toFixed(2)}
          </Typography>
          <Slider
            min={0.05}
            max={0.95}
            step={0.01}
            value={maskRefinementConfig.threshold}
            onChange={(_, value): void => {
              if (typeof value !== 'number') {
                return;
              }

              setMaskRefinementConfig({
                ...maskRefinementConfig,
                threshold: value,
              });
            }}
            valueLabelDisplay="auto"
          />
        </Stack>
        <Stack spacing={1}>
          <Typography variant="body2" color="text.secondary">
            Edge softness: {maskRefinementConfig.edgeSoftness.toFixed(2)}
          </Typography>
          <Slider
            min={0.01}
            max={0.45}
            step={0.01}
            value={maskRefinementConfig.edgeSoftness}
            onChange={(_, value): void => {
              if (typeof value !== 'number') {
                return;
              }

              setMaskRefinementConfig({
                ...maskRefinementConfig,
                edgeSoftness: value,
              });
            }}
            valueLabelDisplay="auto"
          />
        </Stack>
      </Stack>
    </StudioDeckSection>
  );
}
