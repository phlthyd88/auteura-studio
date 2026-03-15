import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import SpaceDashboardRoundedIcon from '@mui/icons-material/SpaceDashboardRounded';
import TimelineRoundedIcon from '@mui/icons-material/TimelineRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import VideoLibraryRoundedIcon from '@mui/icons-material/VideoLibraryRounded';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
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
import { useEffect, useRef, type ChangeEvent, type ReactElement } from 'react';
import { AIPanel } from '../AIPanel';
import { AudioMeters } from '../AudioMeters';
import { BrowserCameraSetupPanel } from '../BrowserCameraSetupPanel';
import { BrandLogo } from '../branding/BrandLogo';
import { Histogram } from '../Histogram';
import { MediaLibrary } from '../MediaLibrary';
import { MonitoringOverviewPanel } from '../MonitoringOverviewPanel';
import { PerformanceDashboard } from '../PerformanceDashboard';
import { RGBParade } from '../RGBParade';
import { RecorderPanel } from '../RecorderPanel';
import { RenderSettingsPanel } from '../RenderSettingsPanel';
import { SceneInsightsPanel } from '../SceneInsightsPanel';
import { TimelinePanel } from '../TimelinePanel';
import { Vectorscope } from '../Vectorscope';
import { ViewCompositorPanel } from '../ViewCompositorPanel';
import { ViewMaskPanel } from '../ViewMaskPanel';
import { useRenderController } from '../../controllers/RenderController';
import { type DrawerTab, useUIStateContext } from '../../providers/UIStateProvider';
import { usePerformanceModeContext } from '../../providers/PerformanceModeProvider';
import { useAppCompatibility } from '../../providers/AppCompatibilityContext';
import { useScopeAnalysis } from '../../hooks/useScopeAnalysis';
import { Viewfinder } from './Viewfinder';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import type { RenderComparisonMode, RenderSplitDirection } from '../../types/render';

interface DrawerTabDefinition {
  readonly icon: ReactElement;
  readonly kicker: string;
  readonly label: string;
  readonly value: DrawerTab;
}

const drawerWidth = 390;

const drawerTabs: readonly DrawerTabDefinition[] = [
  {
    icon: <TuneRoundedIcon fontSize="small" />,
    kicker: 'Color',
    label: 'Adjust',
    value: 'ADJUST',
  },
  {
    icon: <TimelineRoundedIcon fontSize="small" />,
    kicker: 'Edit',
    label: 'Timeline',
    value: 'TIMELINE',
  },
  {
    icon: <AutoAwesomeRoundedIcon fontSize="small" />,
    kicker: 'Vision',
    label: 'AI',
    value: 'AI',
  },
  {
    icon: <SpaceDashboardRoundedIcon fontSize="small" />,
    kicker: 'Monitor',
    label: 'View',
    value: 'VIEW',
  },
  {
    icon: <VideoLibraryRoundedIcon fontSize="small" />,
    kicker: 'Library',
    label: 'Media',
    value: 'MEDIA',
  },
  {
    icon: <SettingsRoundedIcon fontSize="small" />,
    kicker: 'System',
    label: 'Settings',
    value: 'SETTINGS',
  },
] as const;

function PanelCard({
  children,
  title,
}: {
  readonly children: ReactElement | ReactElement[] | string | null;
  readonly title: string;
}): JSX.Element {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 4,
        border: `1px solid ${isDark ? 'rgba(120, 173, 191, 0.16)' : 'rgba(15, 79, 99, 0.08)'}`,
        bgcolor: alpha(theme.palette.background.paper, isDark ? 0.8 : 0.78),
        boxShadow: isDark
          ? '0 18px 40px rgba(0, 0, 0, 0.24)'
          : '0 18px 40px rgba(15, 79, 99, 0.08)',
      }}
    >
      <Typography
        variant="overline"
        sx={{
          color: 'secondary.dark',
          display: 'block',
          mb: 1,
        }}
      >
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function ControlDrawerPanel(): JSX.Element {
  const {
    canvasRef,
    comparisonConfig,
    cycleRenderMode,
    mode,
    overlayConfig,
    setComparisonConfig,
    setOverlayConfig,
  } = useRenderController();
  const { capabilities, diagnostics } = usePerformanceModeContext();
  const { activeDrawerTab } = useUIStateContext();
  const scopeAnalysis = useScopeAnalysis(canvasRef, {
    enabled:
      activeDrawerTab === 'VIEW' &&
      capabilities.allowScopes &&
      capabilities.scopeAnalysisMode !== 'disabled',
    sampleFps: capabilities.scopeFrameRateCap,
    sampleHeight: capabilities.scopeSampleHeight,
    sampleWidth: capabilities.scopeSampleWidth,
  });

  if (activeDrawerTab === 'ADJUST') {
    return <RenderSettingsPanel />;
  }

  if (activeDrawerTab === 'TIMELINE') {
    return <TimelinePanel />;
  }

  if (activeDrawerTab === 'AI') {
    return <AIPanel />;
  }

  if (activeDrawerTab === 'VIEW') {
    return (
      <Stack spacing={2}>
        <BrowserCameraSetupPanel />
        <MonitoringOverviewPanel />
        <PanelCard title="Comparison">
          <Stack spacing={1.5}>
            <Typography variant="h6">Preview Analysis</Typography>
            <Typography variant="body2" color="text.secondary">
              Render mode: {mode}
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
                <MenuItem value="off">Processed Output</MenuItem>
                <MenuItem value="bypass">Bypass View</MenuItem>
                <MenuItem value="split">Split Compare</MenuItem>
                <MenuItem value="wipe">Wipe Compare</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel id="comparison-direction-label">Direction</InputLabel>
              <Select
                label="Direction"
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
              <Stack spacing={1}>
                <Typography variant="body2" color="text.secondary">
                  Divider: {Math.round(comparisonConfig.splitPosition * 100)}%
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
            <Button onClick={cycleRenderMode} variant="outlined">
              Cycle Render Mode
            </Button>
          </Stack>
        </PanelCard>
        <PanelCard title="Overlay">
          <Stack spacing={1.25}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="body2">Grid Overlay</Typography>
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
              <Typography variant="body2">Frame Guide</Typography>
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
            <Typography variant="caption" color="text.secondary">
              Scope sampling: {capabilities.allowScopes ? `${capabilities.scopeAnalysisMode} @ ${capabilities.scopeFrameRateCap} fps` : 'disabled by guardrails'}
            </Typography>
          </Stack>
        </PanelCard>
        <SceneInsightsPanel />
        <ViewCompositorPanel />
        <ViewMaskPanel />
        <AudioMeters />
        {!capabilities.allowScopes ? (
          <Alert severity="info">
            Scopes are paused while Auteura protects preview fluidity.
          </Alert>
        ) : null}
        <Vectorscope data={scopeAnalysis} />
        <Histogram data={scopeAnalysis} />
        <RGBParade data={scopeAnalysis} />
      </Stack>
    );
  }

  if (activeDrawerTab === 'MEDIA') {
    return <MediaLibrary />;
  }

  return (
    <Stack spacing={2}>
      <PerformanceDashboard />
      <PanelCard title="Runtime">
        <Stack spacing={0.45} alignItems="center">
          <Typography variant="body2" color="text.secondary" textAlign="center">
            Estimated preview FPS: {diagnostics.averageFps.toFixed(1)} • device class: {diagnostics.deviceClass}
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            Hidden: {diagnostics.isPageHidden ? 'yes' : 'no'} • memory constrained: {diagnostics.isMemoryConstrained ? 'yes' : 'no'}
          </Typography>
          {diagnostics.heapUsageRatio !== null ? (
            <Typography variant="body2" color="text.secondary" textAlign="center">
              Heap pressure: {(diagnostics.heapUsageRatio * 100).toFixed(0)}%
            </Typography>
          ) : null}
          <Typography variant="body2" color="text.secondary" textAlign="center">
            AI cap: {capabilities.aiFrameRateCap} fps • scopes: {capabilities.allowScopes ? capabilities.scopeAnalysisMode : 'disabled'} • blur: {capabilities.allowBackgroundBlur ? 'enabled' : 'guarded'}
          </Typography>
        </Stack>
      </PanelCard>
      <RecorderPanel />
    </Stack>
  );
}

export function AppLayout(): JSX.Element {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'));
  const { activeDrawerTab, isDrawerOpen, setActiveDrawerTab, setDrawerOpen } = useUIStateContext();
  const compatibility = useAppCompatibility();
  const mobileDrawerFocusReturnRef = useRef<HTMLDivElement | null>(null);
  const mobileDrawerPaperRef = useRef<HTMLDivElement | null>(null);
  const activeTabDefinition: DrawerTabDefinition =
    drawerTabs.find((tabDefinition) => tabDefinition.value === activeDrawerTab) ?? drawerTabs[0]!;

  useKeyboardShortcuts();

  useEffect((): void => {
    if (isDesktop) {
      setDrawerOpen(true);
    }
  }, [isDesktop, setDrawerOpen]);

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
        bgcolor: 'background.default',
        color: 'text.primary',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          width: { xs: 0, lg: 92 },
          display: { xs: 'none', lg: 'flex' },
          flexDirection: 'column',
          justifyContent: 'space-between',
          alignItems: 'center',
          px: 1.1,
          py: 1.5,
          borderRight: `1px solid ${isDark ? 'rgba(120, 173, 191, 0.16)' : 'rgba(15, 79, 99, 0.08)'}`,
          background: isDark
            ? 'linear-gradient(180deg, rgba(11,25,34,0.94) 0%, rgba(10,22,30,0.82) 100%)'
            : 'linear-gradient(180deg, rgba(255,250,244,0.74) 0%, rgba(237,245,245,0.52) 100%)',
          backdropFilter: 'blur(18px)',
        }}
      >
        <Stack spacing={1.4} alignItems="center" sx={{ pt: 0.25 }}>
          <BrandLogo
            size={48}
            style={{
              filter: isDark ? 'drop-shadow(0 10px 20px rgba(0, 0, 0, 0.28))' : 'none',
            }}
          />
          <Box
            sx={{
              px: 0.7,
              py: 1,
              borderRadius: 999,
              border: `1px solid ${isDark ? 'rgba(120, 173, 191, 0.16)' : 'rgba(15, 79, 99, 0.08)'}`,
              background: isDark
                ? 'linear-gradient(180deg, rgba(18,36,48,0.96) 0%, rgba(13,28,38,0.84) 100%)'
                : 'linear-gradient(180deg, rgba(255,250,244,0.88) 0%, rgba(237,245,245,0.7) 100%)',
            }}
          >
            <Typography
              variant="overline"
              sx={{
                color: 'secondary.dark',
                writingMode: 'vertical-rl',
                transform: 'rotate(180deg)',
                fontSize: '0.62rem',
                lineHeight: 1.1,
                letterSpacing: 2.4,
              }}
            >
              Browser Native Post
            </Typography>
          </Box>
        </Stack>
        <Stack spacing={0.8} alignItems="center">
          <Typography
            variant="h6"
            sx={{
              color: 'primary.dark',
              writingMode: 'vertical-rl',
              transform: 'rotate(180deg)',
              letterSpacing: 1.6,
              lineHeight: 1,
            }}
          >
            AUTEURA
          </Typography>
          <Typography
            variant="overline"
            sx={{
              color: 'secondary.dark',
              writingMode: 'vertical-rl',
              transform: 'rotate(180deg)',
              fontSize: '0.56rem',
            }}
          >
            Studio
          </Typography>
        </Stack>
      </Box>

      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            lg: `minmax(0, 1fr) ${drawerWidth}px`,
          },
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: isDark
              ? 'radial-gradient(circle at 12% 18%, rgba(31,197,196,0.14), transparent 22%), radial-gradient(circle at 72% 6%, rgba(192,110,40,0.1), transparent 16%), linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0))'
              : 'radial-gradient(circle at 12% 18%, rgba(31,197,196,0.18), transparent 22%), radial-gradient(circle at 72% 6%, rgba(192,110,40,0.14), transparent 16%), linear-gradient(180deg, rgba(255,255,255,0.36), rgba(255,255,255,0))',
          }}
        />
        <Box
          ref={mobileDrawerFocusReturnRef}
          tabIndex={-1}
          sx={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            p: { xs: 1.1, md: 1.4 },
            gap: { xs: 1, md: 1.15 },
          }}
        >
          {!isDesktop ? (
            <Box
              sx={{
                display: 'flex',
                gap: 1,
                overflowX: 'auto',
                pb: 0.5,
              }}
            >
              {drawerTabs.map((tabDefinition) => {
                const selected = activeDrawerTab === tabDefinition.value;

                return (
                  <Button
                    key={tabDefinition.value}
                    onClick={(): void => {
                      setActiveDrawerTab(tabDefinition.value);
                      setDrawerOpen(true);
                    }}
                    startIcon={tabDefinition.icon}
                    sx={{
                      flexShrink: 0,
                      borderRadius: '16px',
                      px: 1.5,
                      color: selected ? '#fffaf4' : 'primary.dark',
                      background: selected
                        ? 'linear-gradient(135deg, #0f5f74 0%, #20c2c5 100%)'
                        : alpha(theme.palette.background.paper, isDark ? 0.72 : 0.65),
                    }}
                    variant={selected ? 'contained' : 'outlined'}
                  >
                    {tabDefinition.label}
                  </Button>
                );
              })}
            </Box>
          ) : null}

          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            <Viewfinder />
          </Box>
        </Box>

        {isDesktop ? (
          <Box
            sx={{
              minHeight: 0,
              p: 1.4,
              pl: 0,
              position: 'relative',
            }}
          >
            <Box
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                borderRadius: '28px',
                border: `1px solid ${isDark ? 'rgba(120, 173, 191, 0.16)' : 'rgba(15, 79, 99, 0.08)'}`,
                background: isDark
                  ? 'linear-gradient(180deg, rgba(16,32,43,0.96) 0%, rgba(9,20,28,0.98) 100%)'
                  : 'linear-gradient(180deg, rgba(255,250,244,0.94) 0%, rgba(247,242,234,0.96) 100%)',
                backdropFilter: 'blur(18px)',
                boxShadow: isDark
                  ? '-18px 0 48px rgba(0, 0, 0, 0.32)'
                  : '-18px 0 48px rgba(15, 79, 99, 0.12)',
                overflow: 'hidden',
              }}
            >
              <Box
                sx={{
                  px: 2.25,
                  py: 2,
                  borderBottom: `1px solid ${isDark ? 'rgba(120, 173, 191, 0.16)' : 'rgba(15, 79, 99, 0.08)'}`,
                  background: isDark
                    ? 'linear-gradient(180deg, rgba(18,37,50,0.98) 0%, rgba(11,24,33,0.82) 100%)'
                    : 'linear-gradient(180deg, rgba(255,250,244,0.95) 0%, rgba(237,245,245,0.72) 100%)',
                }}
              >
                <Stack spacing={1.4}>
                  {compatibility.isWriteBlocked || compatibility.refreshRecommended ? (
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
                  ) : null}
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Stack direction="row" spacing={0.9} alignItems="center">
                      <BrandLogo size={34} opacity={isDark ? 0.94 : 0.98} />
                      <Box>
                        <Typography variant="overline" sx={{ color: 'secondary.dark' }}>
                        Studio Deck
                        </Typography>
                        <Typography variant="h5">{activeTabDefinition.label}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {activeTabDefinition.kicker} controls and runtime settings in one unified panel.
                        </Typography>
                      </Box>
                    </Stack>
                  </Stack>
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                    {drawerTabs.map((tabDefinition) => {
                      const selected = activeDrawerTab === tabDefinition.value;

                      return (
                        <Button
                          key={tabDefinition.value}
                          onClick={(): void => setActiveDrawerTab(tabDefinition.value)}
                          startIcon={tabDefinition.icon}
                          variant={selected ? 'contained' : 'outlined'}
                          sx={{
                            borderRadius: '16px',
                            color: selected ? '#fffaf4' : 'primary.dark',
                            background: selected
                              ? 'linear-gradient(135deg, #0f5f74 0%, #20c2c5 100%)'
                              : alpha(theme.palette.background.paper, isDark ? 0.04 : 0),
                          }}
                        >
                          {tabDefinition.label}
                        </Button>
                      );
                    })}
                  </Stack>
                </Stack>
              </Box>

              <Box
                sx={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  px: 2.25,
                  py: 2.25,
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                  '&::-webkit-scrollbar': {
                    display: 'none',
                  },
                }}
              >
                <ControlDrawerPanel />
              </Box>
            </Box>
          </Box>
        ) : null}
      </Box>

      {!isDesktop ? (
        <Drawer
          anchor="bottom"
          open={isDrawerOpen}
          onClose={closeMobileDrawer}
          variant="temporary"
          ModalProps={{
            keepMounted: true,
          }}
          PaperProps={{
            ref: mobileDrawerPaperRef,
            sx: {
              width: '100%',
              maxWidth: '100%',
              height: 'min(64vh, 620px)',
              borderTop: `1px solid ${isDark ? 'rgba(120, 173, 191, 0.16)' : 'rgba(15, 79, 99, 0.08)'}`,
              background: isDark
                ? 'linear-gradient(180deg, rgba(16,32,43,0.96) 0%, rgba(9,20,28,0.98) 100%)'
                : 'linear-gradient(180deg, rgba(255,250,244,0.94) 0%, rgba(247,242,234,0.96) 100%)',
              backdropFilter: 'blur(18px)',
              boxShadow: isDark
                ? '0 -18px 48px rgba(0, 0, 0, 0.32)'
                : '0 -18px 48px rgba(15, 79, 99, 0.12)',
            },
          }}
          sx={{
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
            },
          }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Box
              sx={{
                px: 2.25,
                py: 2,
                borderBottom: `1px solid ${isDark ? 'rgba(120, 173, 191, 0.16)' : 'rgba(15, 79, 99, 0.08)'}`,
              }}
            >
              <Stack spacing={1.25}>
                {compatibility.isWriteBlocked || compatibility.refreshRecommended ? (
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
                ) : null}
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Stack spacing={0.35}>
                  <Typography variant="overline" sx={{ color: 'secondary.dark' }}>
                    Studio Deck
                  </Typography>
                  <Typography variant="h5">{activeTabDefinition.label}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {activeTabDefinition.kicker} controls and runtime settings in one unified panel.
                  </Typography>
                  </Stack>
                  <IconButton
                    onClick={closeMobileDrawer}
                    sx={{
                      border: `1px solid ${isDark ? 'rgba(120, 173, 191, 0.16)' : 'rgba(15, 79, 99, 0.08)'}`,
                      bgcolor: alpha(theme.palette.background.paper, isDark ? 0.84 : 0.76),
                    }}
                  >
                    <ChevronRightRoundedIcon />
                  </IconButton>
                </Stack>
              </Stack>
            </Box>

            <Box
              sx={{
                px: 1.5,
                py: 1.5,
                borderBottom: `1px solid ${isDark ? 'rgba(120, 173, 191, 0.16)' : 'rgba(15, 79, 99, 0.08)'}`,
              }}
            >
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {drawerTabs.map((tabDefinition) => {
                  const selected = activeDrawerTab === tabDefinition.value;

                  return (
                    <Button
                      key={tabDefinition.value}
                      onClick={(): void => setActiveDrawerTab(tabDefinition.value)}
                      startIcon={tabDefinition.icon}
                      variant={selected ? 'contained' : 'outlined'}
                      sx={{
                        borderRadius: '16px',
                        color: selected ? '#fffaf4' : 'primary.dark',
                        background: selected
                          ? 'linear-gradient(135deg, #0f5f74 0%, #20c2c5 100%)'
                          : alpha(theme.palette.background.paper, isDark ? 0.04 : 0),
                      }}
                    >
                      {tabDefinition.label}
                    </Button>
                  );
                })}
              </Stack>
            </Box>

            <Box
              sx={{
                flex: 1,
                overflowY: 'auto',
                px: 2.25,
                py: 2.25,
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                '&::-webkit-scrollbar': {
                  display: 'none',
                },
              }}
            >
              <ControlDrawerPanel />
            </Box>
          </Box>
        </Drawer>
      ) : null}
    </Box>
  );
}
