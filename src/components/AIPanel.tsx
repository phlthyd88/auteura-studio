import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';
import FormControlLabel from '@mui/material/FormControlLabel';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { StudioDeckSection } from './StudioDeckSection';
import { useAIController } from '../controllers/AIController';
import { useRenderController } from '../controllers/RenderController';
import {
  usePerformanceModeContext,
  type PerformanceRecommendation,
} from '../providers/PerformanceModeProvider';

export function AIPanel(): JSX.Element {
  const {
    activeFeatures,
    aiResults,
    assetValidation,
    applyCameraAssistPreset,
    beautyAvailable,
    beautyBlockReason,
    beautyRuntime,
    beautySettings,
    backgroundBlurAvailable,
    backgroundBlurBlockReason,
    cameraAssistPresets,
    currentCameraAssistPresetId,
    diagnostics: aiDiagnostics,
    enabledFeatures,
    initializationStage,
    isInitializing,
    isVisibilityPaused,
    processingConfig,
    refreshAssetValidation,
    setBeautySettings,
    setFeatureEnabled,
    setProcessingConfig,
    workerError,
  } = useAIController();
  const { applyCameraAssistRenderSettings } = useRenderController();
  const { applyRecommendation, diagnostics: performanceDiagnostics } = usePerformanceModeContext();

  return (
    <Stack spacing={2}>
      <StudioDeckSection
        kicker="Vision Runtime"
        title="AI Controls"
        icon={<AutoAwesomeRoundedIcon fontSize="small" />}
        actions={isInitializing ? <CircularProgress size={18} /> : null}
      >
        <Stack spacing={1.25}>
          <Typography variant="body2" color="text.secondary">
            Startup stage: {initializationStage}
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 1,
            }}
          >
            <Box sx={{ p: 1.2, borderRadius: 3, bgcolor: alpha('#0e5970', 0.06) }}>
              <Typography variant="overline" sx={{ color: 'secondary.dark' }}>
                Tracking
              </Typography>
              <Typography variant="body2">
                {activeFeatures.faceTracking ? 'Active' : 'Idle'}
              </Typography>
            </Box>
            <Box sx={{ p: 1.2, borderRadius: 3, bgcolor: alpha('#c06e28', 0.08) }}>
              <Typography variant="overline" sx={{ color: 'secondary.dark' }}>
                Blur
              </Typography>
              <Typography variant="body2">
                {activeFeatures.backgroundBlur ? 'Active' : 'Guarded'}
              </Typography>
            </Box>
            <Box sx={{ p: 1.2, borderRadius: 3, bgcolor: alpha('#0e5970', 0.06) }}>
              <Typography variant="overline" sx={{ color: 'secondary.dark' }}>
                Portrait
              </Typography>
              <Typography variant="body2">
                {beautyRuntime.active
                  ? 'Active'
                  : beautySettings.enabled
                    ? 'Bypassed'
                    : 'Idle'}
              </Typography>
            </Box>
            <Box sx={{ p: 1.2, borderRadius: 3, bgcolor: alpha('#c06e28', 0.08) }}>
              <Typography variant="overline" sx={{ color: 'secondary.dark' }}>
                Hidden Tab
              </Typography>
              <Typography variant="body2">
                {isVisibilityPaused ? 'Paused' : 'Live'}
              </Typography>
            </Box>
          </Box>
          {workerError !== null ? <Alert severity="warning">{workerError}</Alert> : null}
          {backgroundBlurBlockReason !== null ? (
            <Alert severity="info">{backgroundBlurBlockReason}</Alert>
          ) : null}
          {beautyBlockReason !== null ? (
            <Alert severity="info">{beautyBlockReason}</Alert>
          ) : null}
          {assetValidation !== null ? (
            <Alert severity={assetValidation.ok ? 'success' : 'info'}>
              {assetValidation.summary}
            </Alert>
          ) : null}
          {assetValidation !== null && !assetValidation.ok ? (
            <Stack spacing={0.5}>
              {assetValidation.checks.map((check) => (
                <Typography key={check.asset.path} variant="caption" color="text.secondary">
                  {check.asset.label}: {check.message}
                </Typography>
              ))}
            </Stack>
          ) : null}
          <Button onClick={(): Promise<void> => refreshAssetValidation()} size="small" variant="outlined">
            Recheck AI Assets
          </Button>
        </Stack>
      </StudioDeckSection>

      <StudioDeckSection
        kicker="Assist Modes"
        title="Camera Presets"
        icon={<AutoAwesomeRoundedIcon fontSize="small" />}
      >
        <Stack spacing={1.25}>
          {cameraAssistPresets.map((preset) => (
            <Box
              key={preset.id}
              sx={{
                p: 1.25,
                borderRadius: 3,
                border:
                  currentCameraAssistPresetId === preset.id
                    ? '1px solid rgba(32,194,197,0.44)'
                    : '1px solid rgba(15,79,99,0.08)',
                bgcolor: alpha(
                  currentCameraAssistPresetId === preset.id ? '#0e5970' : '#fffaf4',
                  currentCameraAssistPresetId === preset.id ? 0.08 : 0.62,
                ),
              }}
            >
              <Stack spacing={0.9}>
                <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="center">
                  <Typography variant="subtitle2">{preset.label}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {currentCameraAssistPresetId === preset.id ? 'Active preset' : 'Preset'}
                  </Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {preset.description}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {preset.enabledFeatures.backgroundBlur ? 'Blur' : 'No blur'} •{' '}
                  {preset.beautySettings.enabled ? 'Portrait retouch' : 'No portrait retouch'} •{' '}
                  {preset.processingConfig.maxInferenceFps} fps cap
                </Typography>
                <Button
                  onClick={(): void => {
                    applyCameraAssistPreset(preset.id);
                    applyCameraAssistRenderSettings(preset.renderSettings);
                  }}
                  size="small"
                  sx={{ alignSelf: 'flex-start' }}
                  variant={currentCameraAssistPresetId === preset.id ? 'contained' : 'outlined'}
                >
                  {currentCameraAssistPresetId === preset.id ? 'Active' : 'Apply preset'}
                </Button>
              </Stack>
            </Box>
          ))}
        </Stack>
      </StudioDeckSection>

      <StudioDeckSection
        kicker="Portrait"
        title="Beauty Controls"
        icon={<AutoAwesomeRoundedIcon fontSize="small" />}
      >
        <Stack spacing={1.25}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 1,
            }}
          >
            <Box sx={{ p: 1.2, borderRadius: 3, bgcolor: alpha('#0e5970', 0.06), textAlign: 'center' }}>
              <Typography variant="overline" sx={{ color: 'secondary.dark' }}>
                Requested
              </Typography>
              <Typography variant="body2">
                {beautySettings.enabled ? 'On' : 'Off'}
              </Typography>
            </Box>
            <Box sx={{ p: 1.2, borderRadius: 3, bgcolor: alpha('#c06e28', 0.08), textAlign: 'center' }}>
              <Typography variant="overline" sx={{ color: 'secondary.dark' }}>
                Active
              </Typography>
              <Typography variant="body2">
                {beautyRuntime.active ? 'Live' : 'Idle'}
              </Typography>
            </Box>
            <Box sx={{ p: 1.2, borderRadius: 3, bgcolor: alpha('#0e5970', 0.06), textAlign: 'center' }}>
              <Typography variant="overline" sx={{ color: 'secondary.dark' }}>
                Quality
              </Typography>
              <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>
                {beautyRuntime.quality}
              </Typography>
            </Box>
          </Box>
          <FormControlLabel
            control={
              <Switch
                checked={beautySettings.enabled}
                onChange={(event): void =>
                  setBeautySettings({
                    ...beautySettings,
                    enabled: event.target.checked,
                  })
                }
              />
            }
            label={beautyAvailable ? 'Portrait retouch' : 'Portrait retouch (guarded)'}
          />
          <FormControlLabel
            control={
              <Switch
                checked={beautySettings.previewBypassUnderLoad}
                onChange={(event): void =>
                  setBeautySettings({
                    ...beautySettings,
                    previewBypassUnderLoad: event.target.checked,
                  })
                }
              />
            }
            label="Bypass during preview overload"
          />
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              Skin smoothing: {beautySettings.skinSmoothing.toFixed(2)}
            </Typography>
            <Slider
              disabled={!beautySettings.enabled}
              max={1}
              min={0}
              onChange={(_, value): void => {
                if (typeof value !== 'number') {
                  return;
                }

                setBeautySettings({
                  ...beautySettings,
                  skinSmoothing: value,
                });
              }}
              step={0.05}
              value={beautySettings.skinSmoothing}
              valueLabelDisplay="auto"
            />
          </Stack>
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              Detail preservation: {beautySettings.detailPreservation.toFixed(2)}
            </Typography>
            <Slider
              disabled={!beautySettings.enabled}
              max={1}
              min={0}
              onChange={(_, value): void => {
                if (typeof value !== 'number') {
                  return;
                }

                setBeautySettings({
                  ...beautySettings,
                  detailPreservation: value,
                });
              }}
              step={0.05}
              value={beautySettings.detailPreservation}
              valueLabelDisplay="auto"
            />
          </Stack>
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              Complexion balancing: {beautySettings.complexionBalancing.toFixed(2)}
            </Typography>
            <Slider
              disabled={!beautySettings.enabled}
              max={1}
              min={0}
              onChange={(_, value): void => {
                if (typeof value !== 'number') {
                  return;
                }

                setBeautySettings({
                  ...beautySettings,
                  complexionBalancing: value,
                });
              }}
              step={0.05}
              value={beautySettings.complexionBalancing}
              valueLabelDisplay="auto"
            />
          </Stack>
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              Under-eye softening: {beautySettings.underEyeSoftening.toFixed(2)}
            </Typography>
            <Slider
              disabled={!beautySettings.enabled}
              max={1}
              min={0}
              onChange={(_, value): void => {
                if (typeof value !== 'number') {
                  return;
                }

                setBeautySettings({
                  ...beautySettings,
                  underEyeSoftening: value,
                });
              }}
              step={0.05}
              value={beautySettings.underEyeSoftening}
              valueLabelDisplay="auto"
            />
          </Stack>
          {beautyRuntime.unavailableReason !== null ? (
            <Alert severity="info">{beautyRuntime.unavailableReason}</Alert>
          ) : (
            <Typography variant="caption" color="text.secondary">
              Portrait retouch uses face-region analysis and may reduce preview quality under load.
            </Typography>
          )}
        </Stack>
      </StudioDeckSection>

      <StudioDeckSection
        kicker="Quality Assist"
        title="Runtime Guidance"
        icon={<AutoAwesomeRoundedIcon fontSize="small" />}
      >
        <Stack spacing={1.25}>
          {performanceDiagnostics.recommendations.length === 0 ? (
            <Alert severity="success">
              Current AI and preview settings are aligned with the active device profile.
            </Alert>
          ) : (
            performanceDiagnostics.recommendations
              .slice(0, 2)
              .map((recommendation: PerformanceRecommendation) => (
              <Box
                key={recommendation.id}
                sx={{
                  p: 1.25,
                  borderRadius: 3,
                  bgcolor: alpha(
                    recommendation.severity === 'warning' ? '#c06e28' : '#0e5970',
                    recommendation.severity === 'warning' ? 0.08 : 0.06,
                  ),
                }}
              >
                <Stack spacing={0.9}>
                  <Typography variant="subtitle2">{recommendation.label}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {recommendation.description}
                  </Typography>
                  <Button
                    color={recommendation.severity === 'warning' ? 'warning' : 'primary'}
                    onClick={(): void => applyRecommendation(recommendation.action)}
                    size="small"
                    sx={{ alignSelf: 'flex-start' }}
                    variant={recommendation.severity === 'warning' ? 'contained' : 'outlined'}
                  >
                    Apply recommendation
                  </Button>
                </Stack>
              </Box>
              ))
          )}
          {enabledFeatures.backgroundBlur && backgroundBlurBlockReason !== null ? (
            <Typography variant="caption" color="text.secondary">
              Blur is requested but currently guarded. Reducing preview quality or switching to a
              more conservative mode can make the system more stable.
            </Typography>
          ) : null}
          {beautySettings.enabled && beautyRuntime.previewBypassed ? (
            <Typography variant="caption" color="text.secondary">
              Portrait retouch is set to bypass during overload. Disabling that bypass may reduce
              preview smoothness.
            </Typography>
          ) : null}
        </Stack>
      </StudioDeckSection>

      <StudioDeckSection
        kicker="Features"
        title="Inference Controls"
        icon={<AutoAwesomeRoundedIcon fontSize="small" />}
      >
        <Stack spacing={1.25}>
          <FormControlLabel
            control={
              <Switch
                checked={enabledFeatures.faceTracking}
                onChange={(event): void => setFeatureEnabled('faceTracking', event.target.checked)}
              />
            }
            label="Face tracking"
          />
          <FormControlLabel
            control={
              <Switch
                checked={enabledFeatures.backgroundBlur}
                onChange={(event): void => setFeatureEnabled('backgroundBlur', event.target.checked)}
              />
            }
            label={backgroundBlurAvailable ? 'Background blur mask' : 'Background blur mask (guarded)'}
          />
          <Stack spacing={1}>
        <Typography variant="body2" color="text.secondary">
          Max inference FPS: {processingConfig.maxInferenceFps}
        </Typography>
        <Slider
          marks
          max={30}
          min={4}
          onChange={(_, value): void => {
            if (typeof value !== 'number') {
              return;
            }

            setProcessingConfig({
              ...processingConfig,
              maxInferenceFps: value,
            });
          }}
          step={1}
          value={processingConfig.maxInferenceFps}
          valueLabelDisplay="auto"
        />
          </Stack>
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              Background blur strength: {processingConfig.backgroundBlurStrength.toFixed(2)}
            </Typography>
            <Slider
              disabled={!enabledFeatures.backgroundBlur || !activeFeatures.backgroundBlur}
              max={1}
              min={0}
              onChange={(_, value): void => {
                if (typeof value !== 'number') {
                  return;
                }

                setProcessingConfig({
                  ...processingConfig,
                  backgroundBlurStrength: value,
                });
              }}
              step={0.05}
              value={processingConfig.backgroundBlurStrength}
              valueLabelDisplay="auto"
            />
          </Stack>
          <FormControlLabel
            control={
              <Switch
                checked={processingConfig.pauseWhenHidden}
                onChange={(event): void =>
                  setProcessingConfig({
                    ...processingConfig,
                    pauseWhenHidden: event.target.checked,
                  })
                }
              />
            }
            label="Pause when tab hidden"
          />
          <Typography variant="body2" color="text.secondary">
            AI sample size: {processingConfig.frameSampleSize}px long edge
          </Typography>
        </Stack>
      </StudioDeckSection>

      <StudioDeckSection
        kicker="Diagnostics"
        title="Latest Results"
        icon={<AutoAwesomeRoundedIcon fontSize="small" />}
      >
        <Stack spacing={0.9}>
          <Typography variant="body2" color="text.secondary">
            Faces detected: {aiResults?.faces.length ?? 0}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Segmentation mask:{' '}
            {aiResults?.segmentationMask === null || aiResults === null
              ? 'No mask available'
              : `${aiResults.segmentationMask.width}x${aiResults.segmentationMask.height}`}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Last inference time:{' '}
            {aiResults === null ? 'No frames processed yet' : `${aiResults.processingDurationMs.toFixed(1)} ms`}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Average inference time: {aiDiagnostics.averageProcessingDurationMs.toFixed(1)} ms
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Submitted / processed frames: {aiDiagnostics.submittedFrameCount} / {aiDiagnostics.processedFrameCount}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Busy drops: {aiDiagnostics.droppedBusyFrames}, cadence skips: {aiDiagnostics.skippedCadenceFrames}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Duplicate skips: {aiDiagnostics.skippedDuplicateFrames}, not ready skips: {aiDiagnostics.skippedNotReadyFrames}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Hidden-tab skips: {aiDiagnostics.skippedHiddenFrames}, worker errors: {aiDiagnostics.workerErrorCount}
          </Typography>
        </Stack>
      </StudioDeckSection>
    </Stack>
  );
}
