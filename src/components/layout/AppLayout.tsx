import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import SensorsRoundedIcon from '@mui/icons-material/SensorsRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import TimelineRoundedIcon from '@mui/icons-material/TimelineRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import VideoSettingsRoundedIcon from '@mui/icons-material/VideoSettingsRounded';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import Drawer from '@mui/material/Drawer';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { alpha, useTheme } from '@mui/material/styles';
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactElement, type ReactNode } from 'react';
import { AIPanel } from '../AIPanel';
import { AudioMeters } from '../AudioMeters';
import { BrowserCameraSetupPanel } from '../BrowserCameraSetupPanel';
import { BrandLogo } from '../branding/BrandLogo';
import { Histogram } from '../Histogram';
import { MediaLibrary } from '../MediaLibrary';
import { PerformanceDashboard } from '../PerformanceDashboard';
import { RGBParade } from '../RGBParade';
import { RecorderPanel } from '../RecorderPanel';
import { RenderSettingsPanel } from '../RenderSettingsPanel';
import { SceneInsightsPanel } from '../SceneInsightsPanel';
import { StudioDeckSection } from '../StudioDeckSection';
import { TimelinePanel } from '../TimelinePanel';
import { Vectorscope } from '../Vectorscope';
import { ViewCompositorPanel } from '../ViewCompositorPanel';
import { ViewMaskPanel } from '../ViewMaskPanel';
import { useAIController } from '../../controllers/AIController';
import { useCameraController } from '../../controllers/CameraController';
import { useRenderController } from '../../controllers/RenderController';
import { useTimelineController } from '../../controllers/TimelineController';
import { useScopeAnalysis } from '../../hooks/useScopeAnalysis';
import { useAppCompatibility } from '../../providers/AppCompatibilityContext';
import { usePerformanceModeContext } from '../../providers/PerformanceModeProvider';
import { type DrawerTab, useUIStateContext } from '../../providers/UIStateProvider';
import type { RenderComparisonMode, RenderSplitDirection } from '../../types/render';
import { Viewfinder } from './Viewfinder';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { InstrumentPanel, SectionEyebrow, SignalDot } from '../../theme/brandPrimitives';

interface StudioModeDefinition {
  readonly description: string;
  readonly icon: ReactElement;
  readonly kicker: string;
  readonly label: string;
  readonly value: DrawerTab;
}

const controlZoneWidth = 364;
const telemetryZoneWidth = 328;

const studioModes: readonly StudioModeDefinition[] = [
  {
    description: 'Live monitor routing, overlays, scopes, and browser camera flow.',
    icon: <SensorsRoundedIcon fontSize="small" />,
    kicker: 'Signal',
    label: 'Monitor',
    value: 'MONITOR',
  },
  {
    description: 'Exposure, color, framing, and finish controls for the active image.',
    icon: <TuneRoundedIcon fontSize="small" />,
    kicker: 'Grade',
    label: 'Adjust',
    value: 'ADJUST',
  },
  {
    description: 'Edit timing, composition, and playback against the active signal.',
    icon: <TimelineRoundedIcon fontSize="small" />,
    kicker: 'Edit',
    label: 'Timeline',
    value: 'TIMELINE',
  },
  {
    description: 'Media ingest, AI assistance, and output stages across the pipeline.',
    icon: <AutoAwesomeRoundedIcon fontSize="small" />,
    kicker: 'Flow',
    label: 'Pipeline',
    value: 'PIPELINE',
  },
  {
    description: 'Performance policy, runtime guardrails, and studio preferences.',
    icon: <SettingsRoundedIcon fontSize="small" />,
    kicker: 'System',
    label: 'Settings',
    value: 'SETTINGS',
  },
] as const;

function ShellSurface({
  children,
  subtle = false,
}: {
  readonly children: ReactNode;
  readonly subtle?: boolean;
}): JSX.Element {
  return (
    <Box
      sx={(theme) => ({
        height: '100%',
        borderRadius: '28px',
        border: `1px solid ${theme.palette.auteura.borderSubtle}`,
        background: subtle
          ? `linear-gradient(180deg, ${alpha(theme.palette.auteura.surfaceElevated, 0.86)} 0%, ${alpha(
              theme.palette.background.default,
              0.92,
            )} 100%)`
          : `linear-gradient(180deg, ${alpha(theme.palette.auteura.surface, 0.96)} 0%, ${alpha(
              theme.palette.background.default,
              0.98,
            )} 100%)`,
        boxShadow: subtle
          ? '0 20px 46px rgba(0, 0, 0, 0.24)'
          : '0 24px 60px rgba(0, 0, 0, 0.34)',
        overflow: 'hidden',
        backdropFilter: 'blur(18px)',
      })}
    >
      {children}
    </Box>
  );
}

function ModeButton({
  isExpanded,
  isActive,
  mode,
  onSelect,
}: {
  readonly isExpanded: boolean;
  readonly isActive: boolean;
  readonly mode: StudioModeDefinition;
  readonly onSelect: (nextTab: DrawerTab) => void;
}): JSX.Element {
  return (
    <Button
      onClick={(): void => onSelect(mode.value)}
      sx={(theme) => ({
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        px: 1.35,
        py: 1.2,
        borderRadius: '18px',
        border: `1px solid ${
          isActive ? alpha(theme.palette.auteura.copper, 0.34) : theme.palette.auteura.borderSubtle
        }`,
        background: isActive
          ? `linear-gradient(135deg, ${alpha(theme.palette.auteura.surfaceElevated, 0.98)} 0%, ${alpha(
              theme.palette.auteura.surface,
              0.94,
            )} 100%)`
          : `linear-gradient(180deg, ${alpha(theme.palette.background.default, 0.88)} 0%, ${alpha(
              theme.palette.background.default,
              0.82,
            )} 100%)`,
        boxShadow: isActive ? 'inset 0 1px 0 rgba(255,255,255,0.06)' : 'none',
        color: theme.palette.text.primary,
        textTransform: 'none',
      })}
      variant="text"
    >
      <Stack direction="row" spacing={1.1} alignItems="flex-start" sx={{ width: '100%' }}>
        <Box
          sx={{
            width: 36,
            height: 36,
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '14px',
            color: isActive ? 'primary.light' : 'rgba(214,232,233,0.74)',
            background: isActive
              ? 'linear-gradient(135deg, rgba(32,194,197,0.18) 0%, rgba(192,110,40,0.14) 100%)'
              : 'rgba(255,255,255,0.04)',
            outline: isActive ? '1px solid rgba(32,194,197,0.18)' : 'none',
          }}
        >
          {mode.icon}
        </Box>
        <Box sx={{ minWidth: 0, textAlign: 'left' }}>
          <SectionEyebrow
            sx={{
              color: isActive ? 'secondary.light' : 'text.secondary',
            }}
          >
            {mode.kicker}
          </SectionEyebrow>
          <Typography variant="subtitle2" sx={{ color: 'text.primary' }}>
            {mode.label}
          </Typography>
        </Box>
        <ChevronRightRoundedIcon
          sx={{
            ml: 'auto',
            mt: 0.4,
            color: isActive ? 'secondary.light' : 'text.secondary',
            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 160ms ease',
          }}
        />
      </Stack>
    </Button>
  );
}

function StatusChip({
  accent,
  label,
}: {
  readonly accent: 'copper' | 'teal' | 'neutral';
  readonly label: string;
}): JSX.Element {
  const palette =
    accent === 'copper'
      ? {
          background: 'rgba(192,110,40,0.18)',
          border: 'rgba(192,110,40,0.28)',
          color: '#f0c5a5',
        }
      : accent === 'teal'
        ? {
            background: 'rgba(32,194,197,0.18)',
            border: 'rgba(32,194,197,0.28)',
            color: '#8de8e5',
          }
        : {
            background: 'rgba(255,255,255,0.05)',
            border: 'rgba(255,255,255,0.08)',
            color: 'rgba(216,236,235,0.84)',
          };

  return (
    <Box
      sx={(theme) => ({
        px: 1.05,
        py: 0.55,
        borderRadius: 999,
        backgroundColor: palette.background,
        border: `1px solid ${palette.border}`,
        boxShadow:
          accent === 'copper'
            ? `0 0 0 1px ${alpha(theme.palette.auteura.copper, 0.06)}`
            : 'none',
      })}
    >
      <Typography variant="caption" sx={{ color: palette.color, fontWeight: 700 }}>
        {label}
      </Typography>
    </Box>
  );
}

function TelemetryMetric({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): JSX.Element {
  return (
    <InstrumentPanel
      sx={{
        p: 1.1,
        borderRadius: '18px',
        minHeight: 88,
      }}
    >
      <SectionEyebrow sx={{ mb: 0.2 }}>
        {label}
      </SectionEyebrow>
      <Typography variant="body2" sx={{ color: 'text.primary' }}>
        {value}
      </Typography>
    </InstrumentPanel>
  );
}

function TelemetrySection({
  children,
  description,
  title,
}: {
  readonly children: ReactNode;
  readonly description?: string;
  readonly title: string;
}): JSX.Element {
  return (
    <InstrumentPanel
      sx={{
        p: 1.6,
        borderRadius: '22px',
      }}
    >
      <SectionEyebrow sx={{ mb: 0.35 }}>
        {title}
      </SectionEyebrow>
      {description !== undefined ? (
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.2 }}>
          {description}
        </Typography>
      ) : null}
      {children}
    </InstrumentPanel>
  );
}

function MonitorControlPanel(): JSX.Element {
  const {
    comparisonConfig,
    cycleRenderMode,
    mode,
    overlayConfig,
    setComparisonConfig,
    setOverlayConfig,
  } = useRenderController();

  return (
    <Stack spacing={2}>
      <StudioDeckSection
        kicker="Monitor"
        title="Signal Console"
        icon={<VideoSettingsRoundedIcon fontSize="small" />}
        actions={
          <Button onClick={cycleRenderMode} variant="outlined">
            Cycle Mode
          </Button>
        }
      >
        <Stack spacing={1.4}>
          <Typography variant="body2" color="text.secondary">
            Comparison, framing guides, and monitor overlays live here so the camera feed stays central while technical changes remain close at hand.
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Active render path: {mode}
          </Typography>
          <FormControl fullWidth size="small">
            <InputLabel id="comparison-mode-label">Comparison</InputLabel>
            <Select
              label="Comparison"
              labelId="comparison-mode-label"
              value={comparisonConfig.mode}
              onChange={(event): void =>
                setComparisonConfig({
                  ...comparisonConfig,
                  mode: event.target.value as RenderComparisonMode,
                })
              }
            >
              <MenuItem value="off">Processed</MenuItem>
              <MenuItem value="bypass">Bypass</MenuItem>
              <MenuItem value="split">Split</MenuItem>
              <MenuItem value="wipe">Wipe</MenuItem>
            </Select>
          </FormControl>
          <FormControl fullWidth size="small">
            <InputLabel id="comparison-direction-label">Orientation</InputLabel>
            <Select
              label="Orientation"
              labelId="comparison-direction-label"
              value={comparisonConfig.splitDirection}
              onChange={(event): void =>
                setComparisonConfig({
                  ...comparisonConfig,
                  splitDirection: event.target.value as RenderSplitDirection,
                })
              }
            >
              <MenuItem value="vertical">Vertical</MenuItem>
              <MenuItem value="horizontal">Horizontal</MenuItem>
            </Select>
          </FormControl>
          {comparisonConfig.mode === 'split' || comparisonConfig.mode === 'wipe' ? (
            <Stack spacing={0.8}>
              <Typography variant="body2" color="text.secondary">
                Divider position {Math.round(comparisonConfig.splitPosition * 100)}%
              </Typography>
              <Slider
                max={1}
                min={0}
                onChange={(_, value): void => {
                  if (typeof value !== 'number') {
                    return;
                  }

                  setComparisonConfig({
                    ...comparisonConfig,
                    splitPosition: value,
                  });
                }}
                step={0.01}
                value={comparisonConfig.splitPosition}
              />
            </Stack>
          ) : null}
          <Stack spacing={0.9}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="body2">Grid</Typography>
              <Switch
                checked={overlayConfig.showGrid}
                onChange={(event: ChangeEvent<HTMLInputElement>): void =>
                  setOverlayConfig({
                    ...overlayConfig,
                    showGrid: event.target.checked,
                  })
                }
              />
            </Stack>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="body2">Frame guide</Typography>
              <Switch
                checked={overlayConfig.showFrameGuide}
                onChange={(event: ChangeEvent<HTMLInputElement>): void =>
                  setOverlayConfig({
                    ...overlayConfig,
                    showFrameGuide: event.target.checked,
                  })
                }
              />
            </Stack>
          </Stack>
        </Stack>
      </StudioDeckSection>
      <BrowserCameraSetupPanel />
      <ViewCompositorPanel />
      <ViewMaskPanel />
      <SceneInsightsPanel />
    </Stack>
  );
}

function PipelineConsole(): JSX.Element {
  return (
    <Stack spacing={2}>
      <MediaLibrary />
      <AIPanel />
      <RecorderPanel />
    </Stack>
  );
}

function SettingsConsole({
  compatibilityMessage,
}: {
  readonly compatibilityMessage: ReactNode;
}): JSX.Element {
  return (
    <Stack spacing={2}>
      {compatibilityMessage}
      <PerformanceDashboard />
    </Stack>
  );
}

function ControlZonePanel({
  compatibilityMessage,
  mode,
}: {
  readonly compatibilityMessage: ReactNode;
  readonly mode: DrawerTab;
}): JSX.Element {
  if (mode === 'MONITOR') {
    return <MonitorControlPanel />;
  }

  if (mode === 'ADJUST') {
    return <RenderSettingsPanel />;
  }

  if (mode === 'TIMELINE') {
    return <TimelinePanel />;
  }

  if (mode === 'PIPELINE') {
    return <PipelineConsole />;
  }

  return <SettingsConsole compatibilityMessage={compatibilityMessage} />;
}

function DesktopModeSection({
  compatibilityMessage,
  isExpanded,
  mode,
  onToggle,
}: {
  readonly compatibilityMessage: ReactNode;
  readonly isExpanded: boolean;
  readonly mode: StudioModeDefinition;
  readonly onToggle: (nextTab: DrawerTab) => void;
}): JSX.Element {
  return (
    <Box
      sx={(theme) => ({
        borderRadius: '22px',
        border: `1px solid ${theme.palette.auteura.borderSubtle}`,
        background: isExpanded
          ? `linear-gradient(180deg, ${alpha(theme.palette.auteura.surfaceElevated, 0.88)} 0%, ${alpha(
              theme.palette.auteura.surface,
              0.82,
            )} 100%)`
          : 'transparent',
        overflow: 'hidden',
      })}
    >
      <ModeButton isActive={isExpanded} isExpanded={isExpanded} mode={mode} onSelect={onToggle} />
      <Collapse in={isExpanded} timeout={180} unmountOnExit>
        <Box sx={{ px: 1.15, pb: 1.15 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.2, px: 0.45 }}>
            {mode.description}
          </Typography>
          <ControlZonePanel compatibilityMessage={compatibilityMessage} mode={mode.value} />
        </Box>
      </Collapse>
    </Box>
  );
}

function TelemetryRail(): JSX.Element {
  const { activeDeviceId, currentSettings, deviceList, error, stream } = useCameraController();
  const { diagnostics: aiDiagnostics, activeFeatures, processingConfig } = useAIController();
  const {
    canvasRef,
    previewSourceMode,
    previewStatus,
    sceneAnalysis,
    virtualOutputStatus,
    webglDiagnostics,
  } = useRenderController();
  const { capabilities, diagnostics, effectiveMode, forceScopesPreview } = usePerformanceModeContext();
  const { transportState } = useTimelineController();
  const scopeAnalysisSettings = useMemo(
    () => ({
      enabled: capabilities.allowScopes && capabilities.scopeAnalysisMode !== 'disabled',
      sampleFps: capabilities.scopeFrameRateCap,
      sampleHeight: capabilities.scopeSampleHeight,
      sampleWidth: capabilities.scopeSampleWidth,
    }),
    [
      capabilities.allowScopes,
      capabilities.scopeAnalysisMode,
      capabilities.scopeFrameRateCap,
      capabilities.scopeSampleHeight,
      capabilities.scopeSampleWidth,
    ],
  );
  const scopeAnalysis = useScopeAnalysis(canvasRef, scopeAnalysisSettings);

  const sourceFormat =
    currentSettings?.width !== null && currentSettings?.width !== undefined
      ? `${currentSettings.width}×${currentSettings.height ?? '?'}${
          currentSettings.frameRate === null || currentSettings.frameRate === undefined
            ? ''
            : ` @ ${currentSettings.frameRate.toFixed(0)} fps`
        }`
      : 'Awaiting source';
  const sceneCoverage =
    sceneAnalysis.stats?.subjectCoverage === null || sceneAnalysis.stats === null
      ? 'Not sampled'
      : `${Math.round(sceneAnalysis.stats.subjectCoverage * 100)}%`;

  return (
    <Stack spacing={1.4}>
      <TelemetrySection
        title="Signal telemetry"
        description="Grouped runtime data keeps input, processing, and output state visible without competing with the live monitor."
      >
        <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap">
          <StatusChip
            accent={previewSourceMode === 'timeline' ? 'copper' : 'teal'}
            label={previewSourceMode === 'timeline' ? 'Timeline source' : 'Live source'}
          />
          <StatusChip
            accent={transportState === 'playing' ? 'copper' : 'neutral'}
            label={previewSourceMode === 'timeline' ? `Transport ${transportState}` : 'Transport live'}
          />
          <StatusChip
            accent={diagnostics.activeDegradationStage > 0 ? 'copper' : 'teal'}
            label={
              diagnostics.activeDegradationStage > 0
                ? `Guardrail stage ${diagnostics.activeDegradationStage}`
                : 'Preview nominal'
            }
          />
        </Stack>
      </TelemetrySection>

      <TelemetrySection title="Input">
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 1,
          }}
        >
          <TelemetryMetric
            label="Active input"
            value={previewSourceMode === 'timeline' ? 'Timeline composite' : activeDeviceId ?? 'System default'}
          />
          <TelemetryMetric label="Source state" value={stream === null ? 'Waiting' : previewStatus} />
          <TelemetryMetric label="Format" value={sourceFormat} />
          <TelemetryMetric label="Detected inputs" value={deviceList.length.toString()} />
        </Box>
        {error !== null ? (
          <Typography variant="caption" sx={{ color: '#f0c5a5', display: 'block', mt: 1 }}>
            {error}
          </Typography>
        ) : null}
      </TelemetrySection>

      <TelemetrySection title="Runtime">
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 1,
          }}
        >
          <TelemetryMetric label="Profile" value={effectiveMode} />
          <TelemetryMetric label="Preview fps" value={diagnostics.averageFps.toFixed(1)} />
          <TelemetryMetric
            label="Renderer"
            value={
              webglDiagnostics.backend === 'webgl'
                ? 'WebGL'
                : webglDiagnostics.backend === 'canvas-2d'
                  ? 'Canvas 2D'
                  : 'Unavailable'
            }
          />
          <TelemetryMetric
            label="Scope path"
            value={
              capabilities.allowScopes
                ? `${capabilities.scopeAnalysisMode}${forceScopesPreview ? ' forced' : ''}`
                : 'Paused'
            }
          />
        </Box>
        <Typography variant="caption" sx={{ color: 'rgba(216,236,235,0.62)', display: 'block', mt: 1 }}>
          Render {diagnostics.webglRenderTimeMs.toFixed(2)} ms • benchmark{' '}
          {diagnostics.gpuBenchmarkMs === null ? 'n/a' : `${diagnostics.gpuBenchmarkMs.toFixed(1)} ms`} • long-frame ratio{' '}
          {(diagnostics.longFrameRatio * 100).toFixed(0)}%
        </Typography>
        {diagnostics.scopeStatusReason === null ? null : (
          <Typography variant="caption" sx={{ color: 'rgba(216,236,235,0.62)', display: 'block', mt: 0.6 }}>
            {diagnostics.scopeStatusReason}
          </Typography>
        )}
      </TelemetrySection>

      <TelemetrySection title="Pipeline">
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 1,
          }}
        >
          <TelemetryMetric label="Bridge" value={virtualOutputStatus.extensionDetected ? virtualOutputStatus.bridgeState : 'Undetected'} />
          <TelemetryMetric label="Clients" value={virtualOutputStatus.clientCount.toString()} />
          <TelemetryMetric label="Output" value={`${virtualOutputStatus.targetFps || 0} fps`} />
          <TelemetryMetric label="Delivery" value={virtualOutputStatus.deliveryProfile} />
        </Box>
        <Typography variant="caption" sx={{ color: 'rgba(216,236,235,0.62)', display: 'block', mt: 1 }}>
          AI {activeFeatures.faceTracking ? 'face' : 'idle'} • {activeFeatures.backgroundBlur ? 'blur' : 'clean'} • sample {processingConfig.frameSampleSize}px • throughput {aiDiagnostics.averageProcessingDurationMs.toFixed(1)} ms
        </Typography>
      </TelemetrySection>

      <TelemetrySection title="Signal analysis">
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 1,
          }}
        >
          <TelemetryMetric label="Scene insights" value={sceneAnalysis.insights.length.toString()} />
          <TelemetryMetric
            label="Faces"
            value={sceneAnalysis.stats?.faceCount === undefined ? 'Not sampled' : sceneAnalysis.stats.faceCount.toString()}
          />
          <TelemetryMetric label="Subject fill" value={sceneCoverage} />
          <TelemetryMetric label="Focus cues" value={sceneAnalysis.status === 'ready' ? 'Active' : 'Warming'} />
        </Box>
      </TelemetrySection>

      <AudioMeters />

      <TelemetrySection title="Scopes" description="Instrumentation stays visible as a dedicated signal layer, not a competing control surface.">
        {!capabilities.allowScopes ? (
          <Alert severity="info">
            {diagnostics.scopeStatusReason ?? 'Scopes are paused while guardrails protect preview fluidity.'}
          </Alert>
        ) : (
          <Stack spacing={1.2}>
            <Vectorscope data={scopeAnalysis} />
            <Histogram data={scopeAnalysis} />
            <RGBParade data={scopeAnalysis} />
          </Stack>
        )}
      </TelemetrySection>
    </Stack>
  );
}

export function AppLayout(): JSX.Element {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'));
  const { activeDrawerTab, isDrawerOpen, setActiveDrawerTab, setDrawerOpen } = useUIStateContext();
  const compatibility = useAppCompatibility();
  const { previewSourceMode, previewStatus } = useRenderController();
  const { diagnostics, effectiveMode } = usePerformanceModeContext();
  const mobileDrawerFocusReturnRef = useRef<HTMLDivElement | null>(null);
  const mobileDrawerPaperRef = useRef<HTMLDivElement | null>(null);
  const [expandedDesktopMode, setExpandedDesktopMode] = useState<DrawerTab | null>(activeDrawerTab);

  const activeMode = studioModes.find((mode) => mode.value === activeDrawerTab) ?? studioModes[0]!;
  const compatibilityMessage =
    compatibility.isWriteBlocked || compatibility.refreshRecommended ? (
      <Alert
        severity={compatibility.isWriteBlocked ? 'error' : 'info'}
        action={
          <Button color="inherit" onClick={(): void => window.location.reload()} size="small">
            Refresh
          </Button>
        }
      >
        {compatibility.isWriteBlocked
          ? compatibility.reason
          : 'A newer cached Auteura build is available. Refresh to keep offline parsing and writes in sync.'}
      </Alert>
    ) : null;

  useKeyboardShortcuts();

  useEffect((): void => {
    if (isDesktop) {
      setDrawerOpen(true);
    }
  }, [isDesktop, setDrawerOpen]);

  useEffect((): void => {
    if (isDesktop && expandedDesktopMode === null) {
      setExpandedDesktopMode(activeDrawerTab);
    }
  }, [activeDrawerTab, expandedDesktopMode, isDesktop]);

  const handleDesktopModeToggle = (nextTab: DrawerTab): void => {
    setActiveDrawerTab(nextTab);
    setExpandedDesktopMode((currentMode) => (currentMode === nextTab ? null : nextTab));
  };

  const closeMobileDrawer = (): void => {
    const activeElement = document.activeElement;

    if (
      activeElement instanceof HTMLElement &&
      mobileDrawerPaperRef.current?.contains(activeElement)
    ) {
      activeElement.blur();
    }

    mobileDrawerFocusReturnRef.current?.focus();
    setDrawerOpen(false);
  };

  return (
    <Box
      sx={{
        height: '100dvh',
        display: 'flex',
        bgcolor: '#06111a',
        color: 'text.primary',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(circle at 12% 14%, rgba(32,194,197,0.12), transparent 20%), radial-gradient(circle at 80% 8%, rgba(192,110,40,0.1), transparent 18%), linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0))',
        }}
      />

      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: isDesktop
            ? `${controlZoneWidth}px minmax(0, 1fr) ${telemetryZoneWidth}px`
            : '1fr',
          gap: { xs: 1, md: 1.2, lg: 1.4 },
          p: { xs: 1, md: 1.2, lg: 1.4 },
          position: 'relative',
          zIndex: 1,
        }}
      >
        {isDesktop ? (
          <ShellSurface subtle>
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <Box
                sx={(theme) => ({
                  px: 2,
                  py: 1.8,
                  borderBottom: `1px solid ${theme.palette.auteura.borderSubtle}`,
                  background:
                    `linear-gradient(180deg, ${alpha(theme.palette.auteura.surfaceElevated, 0.94)} 0%, ${alpha(
                      theme.palette.auteura.surface,
                      0.82,
                    )} 100%)`,
                })}
              >
                <Stack spacing={1.3}>
                  <Stack direction="row" spacing={1.35} alignItems="center" sx={{ pl: 0.8 }}>
                    <BrandLogo maxHeight={76} opacity={1} size={88} />
                    <Box>
                      <SectionEyebrow sx={{ lineHeight: 1 }}>
                        Auteura Studio
                      </SectionEyebrow>
                      <Typography variant="h6" sx={{ color: 'text.primary' }}>
                        Signal Console
                      </Typography>
                    </Box>
                  </Stack>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    Fewer stronger control surfaces, with the monitor kept dominant and technical state moved into a dedicated telemetry rail.
                  </Typography>
                </Stack>
              </Box>

              <Box
                sx={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  px: 1.25,
                  py: 1.25,
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                  '&::-webkit-scrollbar': {
                    display: 'none',
                  },
                }}
              >
                <Stack spacing={0.95}>
                  {studioModes.map((mode) => (
                    <DesktopModeSection
                      compatibilityMessage={compatibilityMessage}
                      key={mode.value}
                      isExpanded={expandedDesktopMode === mode.value}
                      mode={mode}
                      onToggle={handleDesktopModeToggle}
                    />
                  ))}
                </Stack>
              </Box>
            </Box>
          </ShellSurface>
        ) : null}

        <ShellSurface>
          <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            <Box
              ref={mobileDrawerFocusReturnRef}
              tabIndex={-1}
              sx={(theme) => ({
                px: { xs: 1.2, md: 1.6 },
                py: { xs: 1.1, md: 1.35 },
                borderBottom: `1px solid ${theme.palette.auteura.borderSubtle}`,
                background:
                  `linear-gradient(180deg, ${alpha(theme.palette.auteura.surfaceElevated, 0.92)} 0%, ${alpha(
                    theme.palette.auteura.surface,
                    0.78,
                  )} 100%)`,
              })}
            >
              <Stack spacing={1.1}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                  <Stack direction="row" spacing={1.25} alignItems="center">
                    <BrandLogo maxHeight={84} opacity={1} size={96} />
                    <Box>
                      <SectionEyebrow sx={{ lineHeight: 1 }}>
                        Monitor
                      </SectionEyebrow>
                      <Typography variant="h5" sx={{ color: 'text.primary' }}>
                        Auteura Studio
                      </Typography>
                    </Box>
                  </Stack>
                  {!isDesktop ? (
                    <Button onClick={(): void => setDrawerOpen(true)} variant="outlined">
                      {activeMode.label}
                    </Button>
                  ) : null}
                </Stack>
                {!isDesktop ? (
                  <Box sx={{ display: 'flex', gap: 0.8, overflowX: 'auto', pb: 0.2 }}>
                    {studioModes.map((mode) => (
                      <ModeButton
                        key={mode.value}
                        isActive={activeDrawerTab === mode.value}
                        isExpanded={activeDrawerTab === mode.value}
                        mode={mode}
                        onSelect={(nextTab: DrawerTab): void => {
                          setActiveDrawerTab(nextTab);
                          setDrawerOpen(true);
                        }}
                      />
                    ))}
                  </Box>
                ) : null}
                <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap">
                  <Stack direction="row" spacing={0.8} alignItems="center" sx={{ mr: 0.2 }}>
                    <SignalDot />
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                      Signal
                    </Typography>
                  </Stack>
                  <StatusChip
                    accent={previewSourceMode === 'timeline' ? 'copper' : 'teal'}
                    label={previewSourceMode === 'timeline' ? `Timeline ${previewStatus}` : 'Live monitor'}
                  />
                  <StatusChip accent="neutral" label={`Profile ${effectiveMode}`} />
                  <StatusChip
                    accent={diagnostics.activeDegradationStage > 0 ? 'copper' : 'teal'}
                    label={`${diagnostics.averageFps.toFixed(1)} fps`}
                  />
                </Stack>
              </Stack>
            </Box>

            <Box
              sx={{
                flex: 1,
                minHeight: 0,
                p: { xs: 1, md: 1.2 },
                overflow: 'hidden',
              }}
            >
              <Viewfinder />
            </Box>
          </Box>
        </ShellSurface>

        {isDesktop ? (
          <ShellSurface subtle>
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <Box
                sx={(theme) => ({
                  px: 1.8,
                  py: 1.5,
                  borderBottom: `1px solid ${theme.palette.auteura.borderSubtle}`,
                  background:
                    `linear-gradient(180deg, ${alpha(theme.palette.auteura.surfaceElevated, 0.92)} 0%, ${alpha(
                      theme.palette.auteura.surface,
                      0.78,
                    )} 100%)`,
                })}
              >
                <SectionEyebrow sx={{ mb: 0.3 }}>
                  Telemetry
                </SectionEyebrow>
                <Typography variant="h6" sx={{ color: 'text.primary' }}>
                  Signal instrumentation
                </Typography>
              </Box>
              <Box
                sx={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  px: 1.45,
                  py: 1.45,
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                  '&::-webkit-scrollbar': {
                    display: 'none',
                  },
                }}
              >
                <TelemetryRail />
              </Box>
            </Box>
          </ShellSurface>
        ) : null}
      </Box>

      {!isDesktop ? (
        <Drawer
          anchor="bottom"
          open={isDrawerOpen}
          onClose={closeMobileDrawer}
          variant="temporary"
          ModalProps={{ keepMounted: true }}
          PaperProps={{
            ref: mobileDrawerPaperRef,
            sx: {
              width: '100%',
              maxWidth: '100%',
              height: 'min(68vh, 720px)',
              borderTop: '1px solid rgba(120, 173, 191, 0.14)',
              background:
                'linear-gradient(180deg, rgba(13,27,36,0.98) 0%, rgba(8,17,24,1) 100%)',
              boxShadow: '0 -22px 54px rgba(0, 0, 0, 0.38)',
            },
          }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Box
              sx={{
                px: 2,
                py: 1.5,
                borderBottom: '1px solid rgba(120, 173, 191, 0.12)',
              }}
            >
              <Stack spacing={0.9}>
                {compatibilityMessage}
                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                  <Box>
                    <Typography variant="overline" sx={{ color: '#e9ab74', display: 'block', mb: 0.3 }}>
                      {activeMode.kicker}
                    </Typography>
                    <Typography variant="h5" sx={{ color: '#edf4f4' }}>
                      {activeMode.label}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(216,236,235,0.68)' }}>
                      {activeMode.description}
                    </Typography>
                  </Box>
                  <IconButton
                    onClick={closeMobileDrawer}
                    sx={{
                      border: '1px solid rgba(120, 173, 191, 0.16)',
                      bgcolor: 'rgba(255,255,255,0.04)',
                      color: '#edf4f4',
                    }}
                  >
                    <ChevronRightRoundedIcon />
                  </IconButton>
                </Stack>
              </Stack>
            </Box>
            <Box
              sx={{
                flex: 1,
                overflowY: 'auto',
                px: 1.6,
                py: 1.6,
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                '&::-webkit-scrollbar': {
                  display: 'none',
                },
              }}
              >
                <ControlZonePanel compatibilityMessage={compatibilityMessage} mode={activeDrawerTab} />
              </Box>
            </Box>
        </Drawer>
      ) : null}
    </Box>
  );
}
