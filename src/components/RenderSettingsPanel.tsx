import CameraAltRoundedIcon from '@mui/icons-material/CameraAltRounded';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
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
import { alpha, useTheme } from '@mui/material/styles';
import { useState } from 'react';
import { LookLibraryPanel } from './LookLibraryPanel';
import { StudioDeckSection } from './StudioDeckSection';
import { useCameraController } from '../controllers/CameraController';
import { useRenderController } from '../controllers/RenderController';
import {
  getTransformPanLimit,
  getTransformMinimumZoom,
  maximumTransformZoom,
  type ColorGradingSettings,
  type RGBColorBalance,
  type TransformSettings,
} from '../types/color';
import { RenderMode } from '../types/render';

type AdjustSectionId =
  | 'signal'
  | 'pipeline'
  | 'looks'
  | 'exposure'
  | 'balance'
  | 'finishing'
  | 'framing';

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
  const theme = useTheme();

  return (
    <Box
      sx={{
        p: 1.1,
        borderRadius: '16px',
        border: `1px solid ${alpha(theme.palette.auteura.borderSubtle, 0.92)}`,
        background: `linear-gradient(180deg, ${alpha(theme.palette.auteura.surfaceElevated, 0.62)} 0%, ${alpha(
          theme.palette.auteura.surface,
          0.48,
        )} 100%)`,
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.6}>
        <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 700 }}>
          {label}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            color: 'secondary.light',
            fontWeight: 700,
            px: 0.75,
            py: 0.35,
            borderRadius: 999,
            bgcolor: alpha(theme.palette.auteura.copper, 0.12),
            border: `1px solid ${alpha(theme.palette.auteura.copper, 0.18)}`,
          }}
        >
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
    <Stack spacing={1.15}>
      <Typography variant="subtitle2" sx={{ color: 'text.primary', fontWeight: 800 }}>
        {label}
      </Typography>
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

interface CollapsibleControlSectionProps {
  readonly children: JSX.Element;
  readonly description: string;
  readonly expanded: boolean;
  readonly kicker: string;
  readonly onToggle: () => void;
  readonly title: string;
}

function CollapsibleControlSection({
  children,
  description,
  expanded,
  kicker,
  onToggle,
  title,
}: CollapsibleControlSectionProps): JSX.Element {
  const theme = useTheme();

  return (
    <Box
      sx={{
        borderRadius: '22px',
        border: `1px solid ${alpha(theme.palette.auteura.borderSubtle, expanded ? 1 : 0.84)}`,
        background: expanded
          ? `linear-gradient(180deg, ${alpha(theme.palette.auteura.surfaceElevated, 0.84)} 0%, ${alpha(
              theme.palette.auteura.surface,
              0.76,
            )} 100%)`
          : `linear-gradient(180deg, ${alpha(theme.palette.background.default, 0.74)} 0%, ${alpha(
              theme.palette.background.default,
              0.58,
            )} 100%)`,
        boxShadow: expanded ? '0 16px 30px rgba(0,0,0,0.18)' : 'none',
        overflow: 'hidden',
        transition: theme.transitions.create(['background', 'border-color', 'box-shadow'], {
          duration: theme.transitions.duration.shorter,
        }),
      }}
    >
      <Button
        fullWidth
        onClick={onToggle}
        sx={{
          px: 1.5,
          py: 1.3,
          borderRadius: 0,
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          textAlign: 'left',
          textTransform: 'none',
          color: 'text.primary',
        }}
      >
        <Box>
          <Typography variant="overline" sx={{ color: 'secondary.light', lineHeight: 1 }}>
            {kicker}
          </Typography>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, mt: 0.2 }}>
            {title}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.35 }}>
            {description}
          </Typography>
        </Box>
        <KeyboardArrowDownRoundedIcon
          sx={{
            mt: 0.8,
            color: expanded ? 'secondary.light' : 'text.secondary',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: theme.transitions.create('transform', {
              duration: theme.transitions.duration.shortest,
            }),
          }}
        />
      </Button>
      <Collapse in={expanded} timeout={240}>
        <Box
          sx={{
            px: 1.5,
            pb: 1.5,
            pt: 0.2,
            borderTop: `1px solid ${alpha(theme.palette.auteura.borderSubtle, 0.84)}`,
          }}
        >
          {children}
        </Box>
      </Collapse>
    </Box>
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
    lookPresets,
    lutImportError,
    lutLoadError,
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
  const [expandedSection, setExpandedSection] = useState<AdjustSectionId | null>('signal');
  const maximumPanOffset = getTransformPanLimit(maximumTransformZoom);
  const minimumZoomValue = Math.min(maximumTransformZoom, getTransformMinimumZoom(transform));

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

  function toggleSection(nextSection: AdjustSectionId): void {
    setExpandedSection((currentSection) => (currentSection === nextSection ? null : nextSection));
  }

  return (
    <Stack spacing={1.35}>
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
          Shape the camera feed with grouped controls that open on demand instead of falling into a long scrolling stack.
        </Typography>
      </StudioDeckSection>

      <CollapsibleControlSection
        description="Capture source, device switching, and negotiated camera delivery."
        expanded={expandedSection === 'signal'}
        kicker="Signal"
        onToggle={(): void => toggleSection('signal')}
        title="Camera source"
      >
        <Stack spacing={1.15}>
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
              {deviceList.map((device) => (
                <MenuItem key={device.deviceId} value={device.deviceId}>
                  {device.label || `Camera ${deviceList.indexOf(device) + 1}`}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.1}>
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
                {resolutionOptions.map((option) => (
                  <MenuItem key={option.id} value={option.id}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel id="camera-fps-label">FPS</InputLabel>
              <Select
                label="FPS"
                labelId="camera-fps-label"
                value={selectedFrameRate?.toString() ?? 'auto'}
                onChange={(event: SelectChangeEvent<string>): void =>
                  setSelectedFrameRate(event.target.value === 'auto' ? null : Number(event.target.value))
                }
              >
                <MenuItem value="auto">Auto</MenuItem>
                {frameRateOptions.map((option) => (
                  <MenuItem key={option} value={option.toString()}>
                    {option} fps
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Active device: {activeDeviceId ?? 'System default'}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Current format:{' '}
            {currentSettings?.width != null && currentSettings?.height != null
              ? `${currentSettings.width} x ${currentSettings.height}`
              : 'Unknown'}
            {currentSettings?.frameRate != null ? ` @ ${currentSettings.frameRate.toFixed(0)} fps` : ''}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Available cameras: {deviceList.length}
          </Typography>
          {cameraCapabilities !== null ? (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
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
      </CollapsibleControlSection>

      <CollapsibleControlSection
        description="Pipeline treatment for the current preview feed."
        expanded={expandedSection === 'pipeline'}
        kicker="Signal"
        onToggle={(): void => toggleSection('pipeline')}
        title="Render mode"
      >
        <Stack spacing={1.15}>
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
      </CollapsibleControlSection>

      <CollapsibleControlSection
        description="Manage bundled looks, imported LUTs, and saved presets."
        expanded={expandedSection === 'looks'}
        kicker="Color"
        onToggle={(): void => toggleSection('looks')}
        title="Look library"
      >
        <LookLibraryPanel
          activeLutDefinition={activeLutDefinition}
          bundledLuts={bundledLuts}
          embedded
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
      </CollapsibleControlSection>

      <CollapsibleControlSection
        description="Exposure, density, saturation, and white-balance shaping."
        expanded={expandedSection === 'exposure'}
        kicker="Exposure"
        onToggle={(): void => toggleSection('exposure')}
        title="Primary grade"
      >
        <Stack spacing={1.15}>
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
      </CollapsibleControlSection>

      <CollapsibleControlSection
        description="Per-channel balance control for lift, gamma, and gain."
        expanded={expandedSection === 'balance'}
        kicker="Color"
        onToggle={(): void => toggleSection('balance')}
        title="Lift / Gamma / Gain"
      >
        <Stack spacing={1.5}>
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
      </CollapsibleControlSection>

      <CollapsibleControlSection
        description="Finishing effects and processing bypass."
        expanded={expandedSection === 'finishing'}
        kicker="Finish"
        onToggle={(): void => toggleSection('finishing')}
        title="Effects"
      >
        <Stack spacing={1.15}>
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
      </CollapsibleControlSection>

      <CollapsibleControlSection
        description="PTZ crop controls keep the output filled while pan and tilt add digital zoom as needed."
        expanded={expandedSection === 'framing'}
        kicker="Framing"
        onToggle={(): void => toggleSection('framing')}
        title="Geometry"
      >
        <Stack spacing={1.15}>
          <SliderField
            label="Zoom"
            min={minimumZoomValue}
            max={maximumTransformZoom}
            step={0.01}
            value={transform.zoom}
            onChange={(nextValue: number): void => updateTransform({ zoom: nextValue })}
          />
          <SliderField
            label="Pan X"
            min={-maximumPanOffset}
            max={maximumPanOffset}
            step={0.005}
            value={transform.panX}
            onChange={(nextValue: number): void => updateTransform({ panX: nextValue })}
          />
          <SliderField
            label="Pan Y"
            min={-maximumPanOffset}
            max={maximumPanOffset}
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
      </CollapsibleControlSection>
    </Stack>
  );
}
