import AutoFixHighRoundedIcon from '@mui/icons-material/AutoFixHighRounded';
import CenterFocusStrongRoundedIcon from '@mui/icons-material/CenterFocusStrongRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import { useEffect, useMemo, useState } from 'react';
import { useRenderController } from '../controllers/RenderController';
import type { SceneInsight } from '../services/SceneAnalysisService';
import { maximumTransformZoom, minimumTransformZoom } from '../types/color';
import { StudioDeckSection } from './StudioDeckSection';

function getConfidenceLabel(confidence: number): string {
  if (confidence >= 0.8) {
    return 'High confidence';
  }

  if (confidence >= 0.55) {
    return 'Medium confidence';
  }

  return 'Low confidence';
}

export function SceneInsightsPanel(): JSX.Element {
  const theme = useTheme();
  const { colorGrading, sceneAnalysis, setColorGrading, setTransform, transform } = useRenderController();
  const [dismissedInsightIds, setDismissedInsightIds] = useState<readonly string[]>([]);

  useEffect((): void => {
    setDismissedInsightIds((currentIds: readonly string[]): readonly string[] =>
      currentIds.filter((insightId: string): boolean =>
        sceneAnalysis.insights.some((insight: SceneInsight): boolean => insight.id === insightId),
      ),
    );
  }, [sceneAnalysis.insights]);

  const visibleInsights = useMemo<readonly SceneInsight[]>(
    (): readonly SceneInsight[] =>
      sceneAnalysis.insights.filter(
        (insight: SceneInsight): boolean => !dismissedInsightIds.includes(insight.id),
      ),
    [dismissedInsightIds, sceneAnalysis.insights],
  );

  function dismissInsight(insightId: string): void {
    setDismissedInsightIds((currentIds: readonly string[]): readonly string[] =>
      currentIds.includes(insightId) ? currentIds : [...currentIds, insightId],
    );
  }

  function applyInsight(insight: SceneInsight): void {
    if (insight.category === 'exposure') {
      const nextExposure =
        insight.id === 'exposure-under'
          ? Math.min(2, colorGrading.exposure + 0.12)
          : Math.max(-2, colorGrading.exposure - 0.12);
      setColorGrading({
        ...colorGrading,
        exposure: nextExposure,
      });
      dismissInsight(insight.id);
      return;
    }

    if (insight.category === 'white-balance') {
      const nextTemperature =
        insight.id === 'white-balance-warm'
          ? Math.max(-1, colorGrading.temperature - 0.08)
          : Math.min(1, colorGrading.temperature + 0.08);
      setColorGrading({
        ...colorGrading,
        temperature: nextTemperature,
      });
      dismissInsight(insight.id);
      return;
    }

    if (insight.category === 'framing') {
      const offsetX = sceneAnalysis.stats?.framingOffsetX ?? 0;
      const offsetY = sceneAnalysis.stats?.framingOffsetY ?? 0;

      if (insight.id === 'framing-shift-left' || insight.id === 'framing-shift-right') {
        setTransform({
          ...transform,
          panX: transform.panX - offsetX * 0.35,
        });
      } else if (insight.id === 'framing-raise-subject' || insight.id === 'framing-lower-subject') {
        setTransform({
          ...transform,
          panY: transform.panY - offsetY * 0.35,
        });
      } else if (insight.id === 'framing-zoom-in') {
        setTransform({
          ...transform,
          zoom: Math.min(maximumTransformZoom, transform.zoom + 0.12),
        });
      } else if (insight.id === 'framing-zoom-out') {
        setTransform({
          ...transform,
          zoom: Math.max(minimumTransformZoom, transform.zoom - 0.12),
        });
      }

      dismissInsight(insight.id);
      return;
    }

    if (insight.category === 'headroom') {
      const nextPanY =
        insight.id === 'headroom-tight'
          ? transform.panY + 0.08
          : transform.panY - 0.08;
      setTransform({
        ...transform,
        panY: nextPanY,
      });
      dismissInsight(insight.id);
    }
  }

  return (
    <StudioDeckSection
      kicker="Scene Assist"
      title="Scene Insights"
      icon={<VisibilityRoundedIcon fontSize="small" />}
    >
      <Stack spacing={1.2}>
        {sceneAnalysis.status !== 'ready' ? (
          <Alert severity="info">
            Scene analysis becomes available once the monitor has a stable rendered frame.
          </Alert>
        ) : null}
        {sceneAnalysis.status === 'ready' && visibleInsights.length === 0 ? (
          <Alert severity="success">The current frame looks balanced. No immediate scene corrections suggested.</Alert>
        ) : null}
        {visibleInsights.map((insight: SceneInsight) => (
          <Box
            key={insight.id}
            sx={{
              p: 1.35,
              borderRadius: '20px',
              border: `1px solid ${alpha(theme.palette.auteura.borderSubtle, 0.96)}`,
              background: `linear-gradient(180deg, ${alpha(theme.palette.auteura.surfaceElevated, 0.9)} 0%, ${alpha(
                theme.palette.auteura.surface,
                0.82,
              )} 100%)`,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
            }}
          >
            <Stack spacing={1}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle2" sx={{ color: 'text.primary', fontWeight: 800 }}>
                    {insight.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {insight.description}
                  </Typography>
                </Box>
                <Chip
                  color={insight.severity === 'warning' ? 'warning' : 'default'}
                  label={getConfidenceLabel(insight.confidence)}
                  size="small"
                  sx={{ flexShrink: 0 }}
                />
              </Stack>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
                <Chip
                  icon={
                    insight.category === 'framing' || insight.category === 'headroom' ? (
                      <CenterFocusStrongRoundedIcon />
                    ) : (
                      <AutoFixHighRoundedIcon />
                    )
                  }
                  label={insight.category}
                  size="small"
                  variant="outlined"
                />
                <Typography variant="caption" color="text.secondary">
                  {Math.round(insight.confidence * 100)}% confidence
                </Typography>
              </Stack>
              <Stack direction="row" spacing={1}>
                {['exposure', 'white-balance', 'framing', 'headroom'].includes(insight.category) ? (
                  <Button
                    aria-label={`Apply scene insight ${insight.id}`}
                    onClick={(): void => applyInsight(insight)}
                    size="small"
                    variant="contained"
                  >
                    Apply
                  </Button>
                ) : null}
                <Button
                  aria-label={`Dismiss scene insight ${insight.id}`}
                  onClick={(): void => dismissInsight(insight.id)}
                  size="small"
                  variant="outlined"
                >
                  Dismiss
                </Button>
              </Stack>
            </Stack>
          </Box>
        ))}
      </Stack>
    </StudioDeckSection>
  );
}
