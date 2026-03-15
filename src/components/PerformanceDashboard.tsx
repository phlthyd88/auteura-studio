import SpeedRoundedIcon from '@mui/icons-material/SpeedRounded';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { StudioDeckSection } from './StudioDeckSection';
import { useAIController } from '../controllers/AIController';
import { useCameraController } from '../controllers/CameraController';
import { usePerformanceModeContext } from '../providers/PerformanceModeProvider';
import { useThemeMode, type ThemePreference } from '../providers/ThemeModeContext';

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function PerformanceDashboard(): JSX.Element {
  const { currentSettings } = useCameraController();
  const {
    activeFeatures,
    diagnostics: aiDiagnostics,
    enabledFeatures,
    processingConfig,
  } = useAIController();
  const {
    capabilities,
    diagnostics,
    effectiveMode,
    forceBackgroundBlurPreview,
    forceScopesPreview,
    mode,
    previewQualityOverride,
    setForceBackgroundBlurPreview,
    setForceScopesPreview,
    setMode,
    setPreviewQualityOverride,
  } = usePerformanceModeContext();
  const { themePreference, setThemePreference } = useThemeMode();
  const isForceHighQuality =
    previewQualityOverride === 1 ||
    (mode === 'quality' && diagnostics.activeDegradationStage > 0);

  return (
    <Stack spacing={2}>
      <StudioDeckSection
        kicker="Scalable Pro"
        title="Performance"
        icon={<SpeedRoundedIcon fontSize="small" />}
      >
        <Stack spacing={1.25}>
          {diagnostics.activeDegradationStage > 0 ? (
            <Alert severity="warning">
              Adaptive stabilization stage {diagnostics.activeDegradationStage}/3
              {diagnostics.degradationReason === null ? '' : `: ${diagnostics.degradationReason}`}
            </Alert>
          ) : null}
          {isForceHighQuality ? (
            <Alert severity="info">
              Manual high-quality settings may override some preview scaling and can cause stutter.
            </Alert>
          ) : null}
          {forceBackgroundBlurPreview ? (
            <Alert severity="warning">
              Forced background blur is enabled. Preview FPS may drop significantly while blur remains active.
            </Alert>
          ) : null}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 0.9,
            }}
          >
            <Box
              sx={{
                p: 1,
                borderRadius: 3,
                bgcolor: 'rgba(32,194,197,0.08)',
                textAlign: 'center',
              }}
            >
              <Typography variant="overline" sx={{ color: 'secondary.dark', display: 'block', mb: 0.2 }}>
                Hardware Tier
              </Typography>
              <Typography variant="body2">{diagnostics.hardwareTier}</Typography>
            </Box>
            <Box
              sx={{
                p: 1,
                borderRadius: 3,
                bgcolor: 'rgba(192,110,40,0.1)',
                textAlign: 'center',
              }}
            >
              <Typography variant="overline" sx={{ color: 'secondary.dark', display: 'block', mb: 0.2 }}>
                Active Profile
              </Typography>
              <Typography variant="body2">{effectiveMode}</Typography>
            </Box>
            <Box
              sx={{
                p: 1,
                borderRadius: 3,
                bgcolor: 'rgba(32,194,197,0.08)',
                textAlign: 'center',
              }}
            >
              <Typography variant="overline" sx={{ color: 'secondary.dark', display: 'block', mb: 0.2 }}>
                Preview FPS
              </Typography>
              <Typography variant="body2">{diagnostics.averageFps.toFixed(1)}</Typography>
            </Box>
            <Box
              sx={{
                p: 1,
                borderRadius: 3,
                bgcolor: 'rgba(192,110,40,0.1)',
                textAlign: 'center',
              }}
            >
              <Typography variant="overline" sx={{ color: 'secondary.dark', display: 'block', mb: 0.2 }}>
              <Typography variant="overline" sx={{ color: 'secondary.dark', display: 'block', mb: 0.2 }}>
                Est. Latency
              </Typography>
              <Typography variant="body2">
                {aiDiagnostics.averageProcessingDurationMs === 0
                  ? 'n/a'
                  : `${(diagnostics.averageFrameTimeMs + aiDiagnostics.averageProcessingDurationMs).toFixed(1)} ms`}
              </Typography>
            </Box>
          </Box>
          <Typography variant="body2" color="text.secondary">
            Benchmark: {diagnostics.isProfiling ? 'profiling…' : diagnostics.gpuBenchmarkMs === null ? 'unavailable' : `${diagnostics.gpuBenchmarkMs.toFixed(1)} ms GPU`} • CPU threads: {diagnostics.profilerHardwareConcurrency ?? 'n/a'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            WebGL frame: {diagnostics.webglRenderTimeMs.toFixed(2)} ms • avg frame: {diagnostics.averageFrameTimeMs.toFixed(2)} ms • GPU memory: {formatMegabytes(diagnostics.fboMemoryUsageBytes)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Preview FPS: {diagnostics.averageFps.toFixed(1)} • long-frame ratio: {(diagnostics.longFrameRatio * 100).toFixed(0)}%
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Camera delivery: {currentSettings?.frameRate === null || currentSettings === null ? 'n/a' : `${currentSettings.frameRate.toFixed(1)} fps @ ${currentSettings.width ?? '?'}x${currentSettings.height ?? '?'}`}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            AI features: active {activeFeatures.faceTracking ? 'face' : 'no-face'} • {activeFeatures.backgroundBlur ? 'blur' : 'no-blur'} | requested {enabledFeatures.faceTracking ? 'face' : 'no-face'} • {enabledFeatures.backgroundBlur ? 'blur' : 'no-blur'} • sample size: {processingConfig.frameSampleSize}px
          </Typography>
          <Typography variant="body2" color="text.secondary">
            AI throughput: {aiDiagnostics.processedFrameCount} processed / {aiDiagnostics.submittedFrameCount} submitted • avg {aiDiagnostics.averageProcessingDurationMs.toFixed(1)} ms
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Preview quality: {(capabilities.qualityScale * 100).toFixed(0)}% • heavy passes: {capabilities.bypassHeavyPreviewPasses ? 'bypassed while playing' : 'enabled'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Scopes: {capabilities.allowScopes ? capabilities.scopeAnalysisMode : 'disabled'}
            {forceScopesPreview ? ' (forced)' : ''}
          </Typography>
          {diagnostics.scopeStatusReason === null ? null : (
            <Typography variant="body2" color="text.secondary">
              {diagnostics.scopeStatusReason}
            </Typography>
          )}
        </Stack>
      </StudioDeckSection>

      <StudioDeckSection kicker="Appearance" title="Theme" icon={<SpeedRoundedIcon fontSize="small" />}>
        <Stack spacing={1}>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            Switch between Auteura light, dark, or follow the system preference.
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" justifyContent="center">
            {(['light', 'dark', 'system'] as const).map((candidatePreference: ThemePreference) => (
              <Button
                key={candidatePreference}
                onClick={(): void => setThemePreference(candidatePreference)}
                size="small"
                variant={candidatePreference === themePreference ? 'contained' : 'outlined'}
              >
                {candidatePreference.charAt(0).toUpperCase() + candidatePreference.slice(1)}
              </Button>
            ))}
          </Stack>
        </Stack>
      </StudioDeckSection>

      <StudioDeckSection kicker="Overrides" title="Preview Policy" icon={<SpeedRoundedIcon fontSize="small" />}>
        <Stack spacing={1.25}>
          <FormControlLabel
            control={
              <Switch
                checked={forceBackgroundBlurPreview}
                onChange={(event): void => setForceBackgroundBlurPreview(event.target.checked)}
              />
            }
            label="Force background blur in preview"
          />
          <FormControlLabel
            control={
              <Switch
                checked={forceScopesPreview}
                onChange={(event): void => setForceScopesPreview(event.target.checked)}
              />
            }
            label="Force scopes in preview"
          />
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {(['auto', 'quality', 'balanced', 'performance'] as const).map((candidateMode) => (
              <Button
                key={candidateMode}
                onClick={(): void => setMode(candidateMode)}
                size="small"
                variant={candidateMode === mode ? 'contained' : 'outlined'}
              >
                {candidateMode}
              </Button>
            ))}
          </Stack>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Button
              onClick={(): void => setPreviewQualityOverride(null)}
              size="small"
              variant={previewQualityOverride === null ? 'contained' : 'outlined'}
            >
              Auto Quality
            </Button>
            <Button
              onClick={(): void => setPreviewQualityOverride(0.5)}
              size="small"
              variant={previewQualityOverride === 0.5 ? 'contained' : 'outlined'}
            >
              50%
            </Button>
            <Button
              onClick={(): void => setPreviewQualityOverride(0.75)}
              size="small"
              variant={previewQualityOverride === 0.75 ? 'contained' : 'outlined'}
            >
              75%
            </Button>
            <Button
              onClick={(): void => setPreviewQualityOverride(1)}
              size="small"
              variant={previewQualityOverride === 1 ? 'contained' : 'outlined'}
            >
              Force High
            </Button>
          </Stack>
        </Stack>
      </StudioDeckSection>
    </Stack>
  );
}
