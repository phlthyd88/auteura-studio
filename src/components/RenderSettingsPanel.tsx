import CameraAltRoundedIcon from '@mui/icons-material/CameraAltRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { SelectChangeEvent } from '@mui/material/Select';
import { LookLibraryPanel } from './LookLibraryPanel';
import { StudioDeckSection } from './StudioDeckSection';
import { useCameraController } from '../controllers/CameraController';
import { useRenderController } from '../controllers/RenderController';
import type { ColorGradingSettings, RGBColorBalance, TransformSettings } from '../types/color';
import { RenderMode } from '../types/render';

interface SliderFieldProps {
  readonly label: string;
  readonly max: number;
  readonly min: number;
  readonly onChange: (value: number) => void;
  readonly step: number;
  readonly value: number;
}

function SliderField({
  label,
  max,
  min,
  onChange,
  step,
  value,
}: SliderFieldProps): JSX.Element {
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
        <Typography variant="body2">{label}</Typography>
        <Typography variant="caption" color="text.secondary">
          {value.toFixed(2)}
        </Typography>
      </Stack>
      <Slider
        max={max}
        min={min}
        onChange={(_event, nextValue): void => {
          if (typeof nextValue === 'number') {
            onChange(nextValue);
          }
        }}
        step={step}
        value={value}
      />
    </Box>
  );
}

interface BalanceSectionProps {
  readonly label: string;
  readonly onChange: (nextValue: RGBColorBalance) => void;
  readonly value: RGBColorBalance;
}

function BalanceSection({ label, onChange, value }: BalanceSectionProps): JSX.Element {
  function updateChannel(channel: keyof RGBColorBalance, nextValue: number): void {
    onChange({
      ...value,
      [channel]: nextValue,
    });
  }

  return (
    <Stack spacing={1.25}>
      <Typography variant="subtitle2">{label}</Typography>
      <SliderField
        label="Red"
        min={label === 'Lift' ? -0.5 : 0.5}
        max={label === 'Lift' ? 0.5 : 1.5}
        step={0.01}
        value={value.red}
        onChange={(nextValue: number): void => updateChannel('red', nextValue)}
      />
      <SliderField
        label="Green"
        min={label === 'Lift' ? -0.5 : 0.5}
        max={label === 'Lift' ? 0.5 : 1.5}
        step={0.01}
        value={value.green}
        onChange={(nextValue: number): void => updateChannel('green', nextValue)}
      />
      <SliderField
        label="Blue"
        min={label === 'Lift' ? -0.5 : 0.5}
        max={label === 'Lift' ? 0.5 : 1.5}
        step={0.01}
        value={value.blue}
        onChange={(nextValue: number): void => updateChannel('blue', nextValue)}
      />
    </Stack>
  );
}

export function RenderSettingsPanel(): JSX.Element {
  const {
    activeDeviceId,
    cameraCapabilities,
    currentSettings,
    cycleCameraDevice,
    deviceList,
    error: cameraError,
    frameRateOptions,
    selectedFrameRate,
    selectedResolutionId,
    resolutionOptions,
    setActiveDeviceId,
    setSelectedFrameRate,
    setSelectedResolutionId,
  } = useCameraController();
  const {
    activeLutId,
    applyLookPreset,
    availableLuts,
    colorGrading,
    deleteImportedLut,
    deleteLookPreset,
    importLutFile,
    isLutImporting,
    isLutLoading,
    isLookPresetSaving,
    lutImportError,
    lutLoadError,
    lookPresets,
    mode,
    resetRenderSettings,
    saveCurrentLookPreset,
    setActiveLutId,
    setColorGrading,
    setMode,
    setTransform,
    transform,
  } = useRenderController();
  const activeLutDefinition =
    activeLutId === null
      ? null
      : availableLuts.find((lut): boolean => lut.id === activeLutId) ?? null;
  const importedLuts = availableLuts.filter((lut): boolean => lut.sourceType === 'imported');
  const bundledLuts = availableLuts.filter((lut): boolean => lut.sourceType === 'bundled');

  function updateColorGrading(patch: Partial<ColorGradingSettings>): void {
    setColorGrading({
      ...colorGrading,
      ...patch,
    });
  }

  function updateTransform(patch: Partial<TransformSettings>): void {
    setTransform({
      ...transform,
      ...patch,
    });
  }

  return (
    <Stack spacing={2}>
      <StudioDeckSection
        kicker="Color Bay"
        title="Adjust"
        icon={<TuneRoundedIcon fontSize="small" />}
        actions={
          <Button
            color="inherit"
            onClick={resetRenderSettings}
            startIcon={<RestartAltRoundedIcon />}
            variant="outlined"
          >
            Reset
          </Button>
        }
      >
        <Typography variant="body2" color="text.secondary">
          Shape the camera feed with real-time grading, framing, and device controls.
        </Typography>
      </StudioDeckSection>

      <StudioDeckSection kicker="Capture" title="Camera Source" icon={<CameraAltRoundedIcon fontSize="small" />}>
        <Stack spacing={1}>
        <FormControl fullWidth size="small">
          <InputLabel id="camera-device-label">Device</InputLabel>
          <Select
            label="Device"
            labelId="camera-device-label"
            value={activeDeviceId ?? ''}
            onChange={(event: SelectChangeEvent<string>): void =>
              setActiveDeviceId(event.target.value === '' ? null : event.target.value)
            }
          >
            {deviceList.map(
              (device): JSX.Element => (
                <MenuItem key={device.deviceId} value={device.deviceId}>
                  {device.label || `Camera ${deviceList.indexOf(device) + 1}`}
                </MenuItem>
              ),
            )}
          </Select>
        </FormControl>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <FormControl fullWidth size="small">
            <InputLabel id="camera-resolution-label">Resolution</InputLabel>
            <Select
              label="Resolution"
              labelId="camera-resolution-label"
              value={selectedResolutionId}
              onChange={(event: SelectChangeEvent<string>): void =>
                setSelectedResolutionId(event.target.value)
              }
            >
              {resolutionOptions.map(
                (option): JSX.Element => (
                  <MenuItem key={option.id} value={option.id}>
                    {option.label}
                  </MenuItem>
                ),
              )}
            </Select>
          </FormControl>
          <FormControl fullWidth size="small">
            <InputLabel id="camera-fps-label">FPS</InputLabel>
            <Select
              label="FPS"
              labelId="camera-fps-label"
              value={selectedFrameRate?.toString() ?? 'auto'}
              onChange={(event: SelectChangeEvent<string>): void =>
                setSelectedFrameRate(
                  event.target.value === 'auto' ? null : Number(event.target.value),
                )
              }
            >
              <MenuItem value="auto">Auto</MenuItem>
              {frameRateOptions.map(
                (option): JSX.Element => (
                  <MenuItem key={option} value={option.toString()}>
                    {option} fps
                  </MenuItem>
                ),
              )}
            </Select>
          </FormControl>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          Active device: {activeDeviceId ?? 'System default'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Current format:{' '}
          {currentSettings?.width != null && currentSettings?.height != null
            ? `${currentSettings.width} x ${currentSettings.height}`
            : 'Unknown'}
          {currentSettings?.frameRate != null ? ` @ ${currentSettings.frameRate.toFixed(0)} fps` : ''}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Available cameras: {deviceList.length}
        </Typography>
        {cameraCapabilities !== null ? (
          <Typography variant="caption" color="text.secondary">
            Capability range:
            {cameraCapabilities.widthRange !== null && cameraCapabilities.heightRange !== null
              ? ` ${cameraCapabilities.widthRange[0]}-${cameraCapabilities.widthRange[1]}w / ${cameraCapabilities.heightRange[0]}-${cameraCapabilities.heightRange[1]}h`
              : ' resolution unknown'}
            {cameraCapabilities.frameRateRange !== null
              ? `, ${cameraCapabilities.frameRateRange[0].toFixed(0)}-${cameraCapabilities.frameRateRange[1].toFixed(0)} fps`
              : ', fps unknown'}
          </Typography>
        ) : null}
        {cameraError !== null ? (
          <Typography variant="caption" color="warning.main">
            {cameraError}
          </Typography>
        ) : null}
        <Tooltip title="Cycle through detected cameras">
          <IconButton color="primary" onClick={cycleCameraDevice} sx={{ alignSelf: 'flex-start' }}>
            <CameraAltRoundedIcon />
          </IconButton>
        </Tooltip>
        </Stack>
      </StudioDeckSection>

      <StudioDeckSection kicker="Pipeline" title="Render Mode" icon={<TuneRoundedIcon fontSize="small" />}>
        <Stack spacing={1.5}>
        <FormControl fullWidth size="small">
          <InputLabel id="render-mode-label">Mode</InputLabel>
          <Select
            label="Mode"
            labelId="render-mode-label"
            value={mode}
            onChange={(event: SelectChangeEvent<RenderMode>): void =>
              setMode(event.target.value as RenderMode)
            }
          >
            <MenuItem value={RenderMode.Passthrough}>Passthrough</MenuItem>
            <MenuItem value={RenderMode.Monochrome}>Monochrome</MenuItem>
            <MenuItem value={RenderMode.Inverted}>Inverted</MenuItem>
          </Select>
        </FormControl>
        </Stack>
      </StudioDeckSection>

      <LookLibraryPanel
        activeLutDefinition={activeLutDefinition}
        bundledLuts={bundledLuts}
        importedLuts={importedLuts}
        isLutImporting={isLutImporting}
        isLutLoading={isLutLoading}
        isLookPresetSaving={isLookPresetSaving}
        lookPresets={lookPresets}
        lutImportError={lutImportError}
        lutIntensityControl={
          <SliderField
            label="LUT Intensity"
            min={0}
            max={1}
            step={0.01}
            value={colorGrading.lutIntensity}
            onChange={(nextValue: number): void => updateColorGrading({ lutIntensity: nextValue })}
          />
        }
        lutLoadError={lutLoadError}
        onApplyLookPreset={applyLookPreset}
        onDeleteImportedLut={deleteImportedLut}
        onDeleteLookPreset={deleteLookPreset}
        onImportLutFile={importLutFile}
        onLoadLut={setActiveLutId}
        onSaveLookPreset={saveCurrentLookPreset}
      />

      <StudioDeckSection kicker="Grade" title="Primary" icon={<TuneRoundedIcon fontSize="small" />}>
        <Stack spacing={1.5}>
        <SliderField
          label="Exposure"
          min={-2}
          max={2}
          step={0.01}
          value={colorGrading.exposure}
          onChange={(nextValue: number): void => updateColorGrading({ exposure: nextValue })}
        />
        <SliderField
          label="Contrast"
          min={0}
          max={2}
          step={0.01}
          value={colorGrading.contrast}
          onChange={(nextValue: number): void => updateColorGrading({ contrast: nextValue })}
        />
        <SliderField
          label="Saturation"
          min={0}
          max={2}
          step={0.01}
          value={colorGrading.saturation}
          onChange={(nextValue: number): void => updateColorGrading({ saturation: nextValue })}
        />
        <SliderField
          label="Temperature"
          min={-1}
          max={1}
          step={0.01}
          value={colorGrading.temperature}
          onChange={(nextValue: number): void => updateColorGrading({ temperature: nextValue })}
        />
        <SliderField
          label="Tint"
          min={-1}
          max={1}
          step={0.01}
          value={colorGrading.tint}
          onChange={(nextValue: number): void => updateColorGrading({ tint: nextValue })}
        />
        </Stack>
      </StudioDeckSection>

      <StudioDeckSection
        kicker="Balance"
        title="Lift / Gamma / Gain"
        icon={<TuneRoundedIcon fontSize="small" />}
      >
        <Stack spacing={2}>
          <BalanceSection
            label="Lift"
            value={colorGrading.lift}
            onChange={(nextValue: RGBColorBalance): void => updateColorGrading({ lift: nextValue })}
          />
          <BalanceSection
            label="Gamma"
            value={colorGrading.gamma}
            onChange={(nextValue: RGBColorBalance): void => updateColorGrading({ gamma: nextValue })}
          />
          <BalanceSection
            label="Gain"
            value={colorGrading.gain}
            onChange={(nextValue: RGBColorBalance): void => updateColorGrading({ gain: nextValue })}
          />
        </Stack>
      </StudioDeckSection>

      <StudioDeckSection kicker="Finishing" title="Effects" icon={<TuneRoundedIcon fontSize="small" />}>
        <Stack spacing={1.5}>
        <SliderField
          label="Vignette"
          min={0}
          max={1}
          step={0.01}
          value={colorGrading.vignette}
          onChange={(nextValue: number): void => updateColorGrading({ vignette: nextValue })}
        />
        <SliderField
          label="Grain"
          min={0}
          max={1}
          step={0.01}
          value={colorGrading.grain}
          onChange={(nextValue: number): void => updateColorGrading({ grain: nextValue })}
        />
        <FormControlLabel
          control={
            <Switch
              checked={colorGrading.bypass}
              onChange={(event): void => updateColorGrading({ bypass: event.target.checked })}
            />
          }
          label="Bypass color processing"
        />
        </Stack>
      </StudioDeckSection>

      <StudioDeckSection kicker="Geometry" title="Framing" icon={<TuneRoundedIcon fontSize="small" />}>
        <Stack spacing={1.5}>
        <SliderField
          label="Zoom"
          min={1}
          max={2.5}
          step={0.01}
          value={transform.zoom}
          onChange={(nextValue: number): void => updateTransform({ zoom: nextValue })}
        />
        <SliderField
          label="Pan X"
          min={-0.35}
          max={0.35}
          step={0.005}
          value={transform.panX}
          onChange={(nextValue: number): void => updateTransform({ panX: nextValue })}
        />
        <SliderField
          label="Pan Y"
          min={-0.35}
          max={0.35}
          step={0.005}
          value={transform.panY}
          onChange={(nextValue: number): void => updateTransform({ panY: nextValue })}
        />
        <SliderField
          label="Rotation"
          min={-30}
          max={30}
          step={0.5}
          value={transform.rotationDeg}
          onChange={(nextValue: number): void => updateTransform({ rotationDeg: nextValue })}
        />
        <FormControlLabel
          control={
            <Switch
              checked={transform.flipX}
              onChange={(event): void => updateTransform({ flipX: event.target.checked })}
            />
          }
          label="Flip horizontally"
        />
        <FormControlLabel
          control={
            <Switch
              checked={transform.flipY}
              onChange={(event): void => updateTransform({ flipY: event.target.checked })}
            />
          }
          label="Flip vertically"
        />
        </Stack>
      </StudioDeckSection>
    </Stack>
  );
}
