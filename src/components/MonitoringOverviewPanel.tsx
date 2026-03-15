import GraphicEqRoundedIcon from '@mui/icons-material/GraphicEqRounded';
import SensorsRoundedIcon from '@mui/icons-material/SensorsRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { useAudioContext } from '../context/AudioContext';
import { useAIController } from '../controllers/AIController';
import { useRenderController } from '../controllers/RenderController';
import { useTimelineController } from '../controllers/TimelineController';
import { usePerformanceModeContext } from '../providers/PerformanceModeProvider';
import { StudioDeckSection } from './StudioDeckSection';

function StatusMetric({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): JSX.Element {
  return (
    <Box
      sx={{
        p: 1.2,
        borderRadius: '18px',
        border: '1px solid rgba(15,79,99,0.08)',
        bgcolor: alpha('#fffaf4', 0.62),
      }}
    >
      <Typography variant="overline" sx={{ color: 'secondary.dark', display: 'block' }}>
        {label}
      </Typography>
      <Typography variant="body2">{value}</Typography>
    </Box>
  );
}

export function MonitoringOverviewPanel(): JSX.Element {
  const { audioMeters } = useAudioContext();
  const {
    activeFeatures,
    backgroundBlurBlockReason,
    enabledFeatures,
    processingConfig,
  } = useAIController();
  const {
    previewSourceMode,
    previewStatus,
    sceneAnalysis,
    virtualOutputStatus,
  } = useRenderController();
  const {
    activeAudioNodeCount,
    audioPreviewState,
    isPlaying,
    previewMode,
    transportState,
  } = useTimelineController();
  const { applyRecommendation, capabilities, diagnostics, effectiveMode } = usePerformanceModeContext();

  const sourceLabel =
    previewSourceMode === 'timeline'
      ? isPlaying
        ? 'Timeline playback'
        : 'Timeline preview'
      : 'Live camera';
  const audioLabel =
    previewSourceMode === 'timeline'
      ? activeAudioNodeCount > 0
        ? `${activeAudioNodeCount} active audio nodes`
        : audioPreviewState === 'ready'
          ? 'Timeline ready, silent at playhead'
          : 'Timeline audio idle'
      : audioMeters.liveInput.active
        ? 'Live microphone active'
        : 'Live input idle';
  const degradationLabel =
    diagnostics.activeDegradationStage > 0
      ? `Stage ${diagnostics.activeDegradationStage}/3`
      : 'Nominal';
  const aiLabel = activeFeatures.backgroundBlur
    ? 'Blur + face tracking available'
    : activeFeatures.faceTracking
      ? 'Face tracking active'
      : enabledFeatures.backgroundBlur && backgroundBlurBlockReason !== null
        ? 'Blur requested, guarded'
        : 'AI idle';

  return (
    <StudioDeckSection
      kicker="Monitor Flow"
      title="Overview"
      icon={<VisibilityRoundedIcon fontSize="small" />}
    >
      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          <Chip
            color={previewSourceMode === 'timeline' ? 'secondary' : 'primary'}
            label={`Source: ${sourceLabel}`}
            size="small"
          />
          <Chip
            color={transportState === 'playing' ? 'success' : 'default'}
            label={
              previewMode === 'timeline'
                ? `Transport: ${transportState}`
                : 'Transport: live'
            }
            size="small"
          />
          <Chip
            color={audioMeters.timelinePlayback.active || audioMeters.liveInput.active ? 'success' : 'default'}
            icon={<GraphicEqRoundedIcon />}
            label={previewSourceMode === 'timeline' ? 'Audio path: timeline' : 'Audio path: live input'}
            size="small"
          />
          <Chip
            color={diagnostics.activeDegradationStage > 0 ? 'warning' : 'success'}
            label={`Preview: ${degradationLabel}`}
            size="small"
          />
        </Stack>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 1,
          }}
        >
          <StatusMetric label="Source Status" value={`${sourceLabel} • ${previewStatus}`} />
          <StatusMetric label="Audio Status" value={audioLabel} />
          <StatusMetric
            label="AI Status"
            value={`${aiLabel} • ${processingConfig.frameSampleSize}px`}
          />
          <StatusMetric
            label="Guardrails"
            value={`${effectiveMode} • ${(capabilities.qualityScale * 100).toFixed(0)}% quality`}
          />
        </Box>

        <Box
          sx={{
            p: 1.2,
            borderRadius: '18px',
            border: '1px solid rgba(15,79,99,0.08)',
            bgcolor: alpha('#fffaf4', 0.62),
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
            <SensorsRoundedIcon fontSize="small" color="primary" />
            <Typography variant="subtitle2">Browser Camera Host</Typography>
          </Stack>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 1,
            }}
          >
            <StatusMetric
              label="Bridge"
              value={
                virtualOutputStatus.extensionDetected
                  ? virtualOutputStatus.bridgeState
                  : 'not detected'
              }
            />
            <StatusMetric
              label="Registration"
              value={virtualOutputStatus.hostRegistered ? 'host registered' : 'host idle'}
            />
            <StatusMetric
              label="Clients"
              value={virtualOutputStatus.clientCount.toString()}
            />
            <StatusMetric
              label="Output"
              value={`${virtualOutputStatus.targetFps || 0} fps • ${virtualOutputStatus.deliveryProfile} • ${
                virtualOutputStatus.hasAudio ? 'av' : 'video'
              }`}
            />
            <StatusMetric
              label="Leases"
              value={virtualOutputStatus.leasedStreamCount.toString()}
            />
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Bridge event:{' '}
            {virtualOutputStatus.lastBridgeEvent === null
              ? 'waiting'
              : virtualOutputStatus.lastBridgeEvent}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Last heartbeat:{' '}
            {virtualOutputStatus.lastHeartbeatAt === null
              ? 'waiting'
              : new Date(virtualOutputStatus.lastHeartbeatAt).toLocaleTimeString()}
            {virtualOutputStatus.lastError === null
              ? ''
              : ` • ${virtualOutputStatus.lastError}`}
          </Typography>
        </Box>

        {backgroundBlurBlockReason !== null ? (
          <Typography variant="body2" color="text.secondary">
            Blur guardrail: {backgroundBlurBlockReason}
          </Typography>
        ) : null}
        {diagnostics.recommendations.length > 0 ? (
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              Recommended quality actions
            </Typography>
            {diagnostics.recommendations.slice(0, 2).map((recommendation) => (
              <Box
                key={recommendation.id}
                sx={{
                  p: 1.2,
                  borderRadius: '18px',
                  border: '1px solid rgba(15,79,99,0.08)',
                  bgcolor: alpha('#fffaf4', 0.62),
                }}
              >
                <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center">
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle2">{recommendation.label}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {recommendation.description}
                    </Typography>
                  </Box>
                  <Button
                    color={recommendation.severity === 'warning' ? 'warning' : 'primary'}
                    onClick={(): void => applyRecommendation(recommendation.action)}
                    size="small"
                    variant={recommendation.severity === 'warning' ? 'contained' : 'outlined'}
                  >
                    Apply
                  </Button>
                </Stack>
              </Box>
            ))}
          </Stack>
        ) : null}
        <Typography variant="body2" color="text.secondary">
          Scene assist: {sceneAnalysis.insights.length} active suggestion
          {sceneAnalysis.insights.length === 1 ? '' : 's'}
          {sceneAnalysis.stats?.faceCount === undefined
            ? ''
            : ` • faces ${sceneAnalysis.stats.faceCount}`}
          {sceneAnalysis.stats?.subjectCoverage === null || sceneAnalysis.stats === null
            ? ''
            : ` • subject ${(sceneAnalysis.stats.subjectCoverage * 100).toFixed(0)}%`}
        </Typography>
      </Stack>
    </StudioDeckSection>
  );
}
