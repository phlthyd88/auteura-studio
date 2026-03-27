import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useCameraController } from '../../controllers/CameraController';
import { useRenderController } from '../../controllers/RenderController';
import {
  useTimelinePreviewState,
  type TimelinePreviewSource,
} from '../../services/TimelinePreviewStore';
import { getTopTimelineCompositionLayer } from '../../types/compositor';

function hiddenSourceSx(): Record<string, string | number> {
  return {
    height: '1px',
    opacity: 0,
    pointerEvents: 'none',
    position: 'absolute',
    width: '1px',
  };
}

function statusTone(
  active: boolean,
  activeColor: string,
  isDark: boolean,
): { readonly backgroundColor: string; readonly color: string; readonly border: string } {
  return {
    backgroundColor: active
      ? alpha(activeColor, isDark ? 0.24 : 0.14)
      : alpha(isDark ? '#9bc0d1' : '#0f4f63', isDark ? 0.08 : 0.05),
    border: `1px solid ${
      active
        ? alpha(activeColor, isDark ? 0.48 : 0.34)
        : isDark
          ? 'rgba(120, 173, 191, 0.16)'
          : 'rgba(15, 79, 99, 0.1)'
    }`,
    color: active ? activeColor : isDark ? '#a9bec8' : '#476071',
  };
}

function formatRendererRuntimeReason(reason: string | null): string {
  switch (reason) {
    case 'context-acquired-lost':
      return 'context acquired lost';
    case 'context-lost':
      return 'context lost';
    case 'gpu-limits-unreadable':
      return 'GPU limits unreadable';
    case 'initialization-failed':
      return 'initialization failed';
    case 'render-failed':
      return 'render failed';
    case 'render-loop-failed':
      return 'render loop failed';
    case 'renderer-unavailable':
      return 'renderer unavailable';
    case 'webgl-unavailable':
      return 'WebGL unavailable';
    default:
      return 'none';
  }
}

export function Viewfinder(): JSX.Element {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { error: cameraError, stream, videoRef } = useCameraController();
  const {
    bindTimelineSource,
    canvasRef,
    mode,
    overlayConfig,
    previewSourceMode,
    previewStatus,
    rendererRuntime,
    rendererError,
    webglDiagnostics,
  } = useRenderController();
  const timelinePreviewState = useTimelinePreviewState();
  const timelineImageElementsRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const timelineImageRefCallbacksRef =
    useRef<Map<string, (node: HTMLImageElement | null) => void>>(new Map());
  const timelineVideoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const timelineVideoRefCallbacksRef =
    useRef<Map<string, (node: HTMLVideoElement | null) => void>>(new Map());
  const [aspectRatio, setAspectRatio] = useState<number>(16 / 9);
  const activeSources = timelinePreviewState.activeSources;
  const topLayer = useMemo(
    () => getTopTimelineCompositionLayer(timelinePreviewState.composition),
    [timelinePreviewState.composition],
  );
  const topSource = topLayer === null ? null : activeSources[topLayer.sourceId] ?? null;

  function getTimelineImageRefCallback(
    sourceId: string,
  ): (node: HTMLImageElement | null) => void {
    const existingCallback = timelineImageRefCallbacksRef.current.get(sourceId);

    if (existingCallback !== undefined) {
      return existingCallback;
    }

    const nextCallback = (node: HTMLImageElement | null): void => {
      if (node === null) {
        timelineImageElementsRef.current.delete(sourceId);
        bindTimelineSource(sourceId, null);
        return;
      }

      timelineImageElementsRef.current.set(sourceId, node);
      bindTimelineSource(sourceId, node);
    };

    timelineImageRefCallbacksRef.current.set(sourceId, nextCallback);
    return nextCallback;
  }

  function getTimelineVideoRefCallback(
    sourceId: string,
  ): (node: HTMLVideoElement | null) => void {
    const existingCallback = timelineVideoRefCallbacksRef.current.get(sourceId);

    if (existingCallback !== undefined) {
      return existingCallback;
    }

    const nextCallback = (node: HTMLVideoElement | null): void => {
      if (node === null) {
        timelineVideoElementsRef.current.delete(sourceId);
        bindTimelineSource(sourceId, null);
        return;
      }

      timelineVideoElementsRef.current.set(sourceId, node);
      bindTimelineSource(sourceId, node);
    };

    timelineVideoRefCallbacksRef.current.set(sourceId, nextCallback);
    return nextCallback;
  }

  const activeSourceLabel = useMemo<string>(() => {
    if (previewSourceMode === 'timeline') {
      const activeSourceCount = Object.keys(activeSources).length;

      if (activeSourceCount === 0) {
        return 'Timeline preview awaiting media';
      }

      return `Rendering timeline stack (${activeSourceCount} source${activeSourceCount === 1 ? '' : 's'})`;
    }

    if (stream === null) {
      return 'Waiting for input feed';
    }

    switch (rendererRuntime.status) {
      case 'context-lost':
        return 'WebGL context lost, awaiting restoration';
      case 'fallback':
        return 'Rendering camera texture to Canvas 2D fallback';
      case 'error':
        return 'Renderer unavailable';
      default:
        return 'Rendering camera texture to WebGL';
    }
  }, [activeSources, previewSourceMode, rendererRuntime.status, stream]);

  useEffect((): void => {
    const activeSourceIds = new Set(Object.keys(activeSources));

    timelineVideoRefCallbacksRef.current.forEach((_callback, sourceId: string): void => {
      if (!activeSourceIds.has(sourceId)) {
        timelineVideoRefCallbacksRef.current.delete(sourceId);
      }
    });
    timelineImageRefCallbacksRef.current.forEach((_callback, sourceId: string): void => {
      if (!activeSourceIds.has(sourceId)) {
        timelineImageRefCallbacksRef.current.delete(sourceId);
      }
    });
  }, [activeSources]);

  useEffect((): (() => void) | void => {
    if (previewSourceMode !== 'timeline' || topSource === null) {
      const videoElement = videoRef.current;

      if (videoElement === null) {
        return undefined;
      }

      const trackedVideoElement = videoElement;

      function updateLiveAspectRatio(): void {
        if (trackedVideoElement.videoWidth > 0 && trackedVideoElement.videoHeight > 0) {
          setAspectRatio(trackedVideoElement.videoWidth / trackedVideoElement.videoHeight);
        }
      }

      updateLiveAspectRatio();
      trackedVideoElement.addEventListener('loadedmetadata', updateLiveAspectRatio);
      trackedVideoElement.addEventListener('resize', updateLiveAspectRatio);

      return (): void => {
        trackedVideoElement.removeEventListener('loadedmetadata', updateLiveAspectRatio);
        trackedVideoElement.removeEventListener('resize', updateLiveAspectRatio);
      };
    }

    if (topSource.mediaItem.type === 'image') {
      const imageElement = timelineImageElementsRef.current.get(topSource.sourceId);

      if (imageElement === undefined) {
        return undefined;
      }

      const trackedImageElement = imageElement;

      function updateImageAspectRatio(): void {
        if (trackedImageElement.naturalWidth > 0 && trackedImageElement.naturalHeight > 0) {
          setAspectRatio(trackedImageElement.naturalWidth / trackedImageElement.naturalHeight);
        }
      }

      updateImageAspectRatio();
      trackedImageElement.addEventListener('load', updateImageAspectRatio);

      return (): void => {
        trackedImageElement.removeEventListener('load', updateImageAspectRatio);
      };
    }

    const videoElement = timelineVideoElementsRef.current.get(topSource.sourceId);

    if (videoElement === undefined) {
      return undefined;
    }

    const trackedVideoElement = videoElement;

    function updateTimelineAspectRatio(): void {
      if (trackedVideoElement.videoWidth > 0 && trackedVideoElement.videoHeight > 0) {
        setAspectRatio(trackedVideoElement.videoWidth / trackedVideoElement.videoHeight);
      }
    }

    updateTimelineAspectRatio();
    trackedVideoElement.addEventListener('loadedmetadata', updateTimelineAspectRatio);
    trackedVideoElement.addEventListener('resize', updateTimelineAspectRatio);

    return (): void => {
      trackedVideoElement.removeEventListener('loadedmetadata', updateTimelineAspectRatio);
      trackedVideoElement.removeEventListener('resize', updateTimelineAspectRatio);
    };
  }, [previewSourceMode, topSource, videoRef]);

  useEffect((): void => {
    if (timelinePreviewState.mode !== 'timeline') {
      return;
    }

    Object.values(activeSources).forEach((source: TimelinePreviewSource): void => {
      if (source.mediaItem.type === 'image') {
        const imageElement = timelineImageElementsRef.current.get(source.sourceId);

        if (imageElement !== undefined && imageElement.src !== source.sourceUrl) {
          imageElement.src = source.sourceUrl;
        }

        return;
      }

      const videoElement = timelineVideoElementsRef.current.get(source.sourceId);

      if (videoElement === undefined) {
        return;
      }

      if (videoElement.src !== source.sourceUrl) {
        videoElement.src = source.sourceUrl;
        videoElement.load();
      }

      const nextTimeSeconds = source.sourceOffsetMs / 1000;

      if (
        Number.isFinite(nextTimeSeconds) &&
        Math.abs(videoElement.currentTime - nextTimeSeconds) > 0.05
      ) {
        videoElement.currentTime = nextTimeSeconds;
      }
    });
  }, [activeSources, timelinePreviewState.mode]);

  return (
    <Stack spacing={2} sx={{ height: '100%', minHeight: 0 }}>
      <Box
        sx={{
          px: 1.1,
          py: 0.9,
          borderRadius: '20px',
          border: `1px solid ${theme.palette.auteura.borderSubtle}`,
          background: isDark
            ? `linear-gradient(180deg, ${alpha(theme.palette.auteura.surfaceElevated, 0.94)} 0%, ${alpha(
                theme.palette.auteura.surface,
                0.9,
              )} 100%)`
            : 'linear-gradient(180deg, rgba(255,250,244,0.92) 0%, rgba(242,247,246,0.74) 100%)',
          boxShadow: isDark
            ? '0 10px 22px rgba(0, 0, 0, 0.24)'
            : '0 10px 22px rgba(15, 79, 99, 0.07)',
          flexShrink: 0,
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={0.8}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', md: 'center' }}
        >
          <Box>
            <Typography variant="overline" sx={{ color: 'secondary.light', lineHeight: 1 }}>
              Primary monitor
            </Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'text.primary' }}>
              Signal view
            </Typography>
          </Box>

          <Stack direction="row" spacing={0.7} useFlexGap flexWrap="wrap">
            <Box
              sx={{
                px: 1.1,
                py: 0.55,
                borderRadius: 999,
                ...statusTone(true, theme.palette.auteura.teal, isDark),
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'capitalize' }}>
                {mode}
              </Typography>
            </Box>
            <Box
              sx={{
                px: 1.1,
                py: 0.55,
                borderRadius: 999,
                ...statusTone(stream !== null, theme.palette.auteura.tealLight, isDark),
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 700 }}>
                {previewSourceMode === 'timeline' ? `Timeline ${previewStatus}` : 'Live camera'}
              </Typography>
            </Box>
            <Box
              sx={{
                px: 1.1,
                py: 0.55,
                borderRadius: 999,
                ...statusTone(
                  overlayConfig.showGrid || overlayConfig.showFrameGuide,
                  theme.palette.auteura.copper,
                  isDark,
                ),
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 700 }}>
                {[overlayConfig.showGrid ? 'Grid' : null, overlayConfig.showFrameGuide ? 'Guide' : null]
                  .filter((value): value is string => value !== null)
                  .join(' + ') || 'Clean'}
              </Typography>
            </Box>
          </Stack>
        </Stack>
      </Box>
      {cameraError !== null ? <Alert severity="error">{cameraError}</Alert> : null}
      {rendererError !== null ? (
        <Stack spacing={1}>
          <Alert severity={rendererRuntime.status === 'fallback' ? 'info' : 'warning'}>
            {rendererError}
          </Alert>
          <Box
            sx={{
              px: 1.2,
              py: 1,
              borderRadius: '16px',
              border: `1px solid ${theme.palette.auteura.borderSubtle}`,
              backgroundColor: isDark
                ? alpha(theme.palette.auteura.surfaceElevated, 0.86)
                : 'rgba(255, 250, 244, 0.88)',
            }}
          >
            <Typography variant="overline" sx={{ color: 'secondary.dark', display: 'block', mb: 0.4 }}>
              WebGL Diagnostics
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              active backend: {webglDiagnostics.backend}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              runtime status: {rendererRuntime.status}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              failure reason: {formatRendererRuntimeReason(rendererRuntime.reason)}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              API exposed: {webglDiagnostics.apiExposed ? 'yes' : 'no'}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              `webgl` context: {webglDiagnostics.webglContextAvailable ? 'available' : 'blocked'}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              `experimental-webgl` context:{' '}
              {webglDiagnostics.experimentalContextAvailable ? 'available' : 'blocked'}
            </Typography>
          </Box>
        </Stack>
      ) : null}
      <Box
        sx={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          borderRadius: '38px',
          overflow: 'hidden',
          border: `1px solid ${alpha(theme.palette.auteura.tealLight, isDark ? 0.18 : 0.12)}`,
          background:
            `radial-gradient(circle at 12% 12%, ${alpha(theme.palette.auteura.tealLight, 0.2)}, transparent 20%), radial-gradient(circle at 78% 20%, ${alpha(theme.palette.auteura.copper, 0.18)}, transparent 22%), linear-gradient(180deg, rgba(9,34,47,0.98) 0%, rgba(5,17,26,1) 100%)`,
          boxShadow: isDark ? '0 30px 60px rgba(0, 0, 0, 0.45)' : '0 30px 60px rgba(8, 30, 43, 0.28)',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background:
              'linear-gradient(135deg, rgba(255,255,255,0.06), transparent 24%, transparent 76%, rgba(255,255,255,0.04))',
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            inset: 18,
            borderRadius: '28px',
            border: `1px solid ${alpha(theme.palette.auteura.copperLight, 0.12)}`,
            pointerEvents: 'none',
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            inset: 18,
            borderRadius: '28px',
            pointerEvents: 'none',
            background:
              'radial-gradient(circle at center, rgba(255,255,255,0.08) 0 1px, transparent 1px 12%), repeating-radial-gradient(circle at center, rgba(255,255,255,0.08) 0 1px, transparent 1px 40px)',
            opacity: 0.22,
          }}
        />
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            minHeight: 0,
            p: { xs: 0.7, md: 1.1 },
          }}
        >
          <Box
            sx={{
              position: 'relative',
              width: 'min(100%, calc(100dvh * 1.55))',
              maxWidth: '100%',
              maxHeight: '100%',
              aspectRatio: `${aspectRatio}`,
              borderRadius: '28px',
              overflow: 'hidden',
              boxShadow: '0 18px 40px rgba(0, 0, 0, 0.28)',
            }}
          >
            <Box
              component="video"
              ref={videoRef}
              autoPlay
              muted
              playsInline
              sx={hiddenSourceSx()}
            />
            {Object.values(activeSources).map((source: TimelinePreviewSource): JSX.Element =>
              source.mediaItem.type === 'video' ? (
                <Box
                  key={source.sourceId}
                  component="video"
                  muted
                  playsInline
                  preload="auto"
                  ref={getTimelineVideoRefCallback(source.sourceId)}
                  sx={hiddenSourceSx()}
                />
              ) : (
                <Box
                  key={source.sourceId}
                  component="img"
                  alt=""
                  ref={getTimelineImageRefCallback(source.sourceId)}
                  sx={hiddenSourceSx()}
                />
              ),
            )}
            <Box
              component="canvas"
              ref={canvasRef}
              sx={{
                width: '100%',
                height: '100%',
                display: 'block',
                objectFit: 'contain',
                borderRadius: '28px',
                background:
                  `radial-gradient(circle at top, ${alpha(theme.palette.auteura.tealLight, 0.18)}, transparent 26%), #05131d`,
              }}
            />
            {overlayConfig.showGrid ? (
              <Box
                sx={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  backgroundImage:
                    'linear-gradient(to right, rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.1) 1px, transparent 1px)',
                  backgroundSize: '33.333% 100%, 100% 33.333%',
                  borderRadius: '28px',
                }}
              />
            ) : null}
            {overlayConfig.showFrameGuide ? (
              <Box
                sx={{
                  position: 'absolute',
                  inset: '8%',
                  border: '1px solid rgba(255,255,255,0.28)',
                  borderRadius: '20px',
                  pointerEvents: 'none',
                }}
              />
            ) : null}
            <Box
              sx={{
                position: 'absolute',
                top: { xs: 18, md: 22 },
                left: { xs: 18, md: 24 },
                width: { xs: 88, md: 122 },
                opacity: isDark ? 0.2 : 0.16,
                pointerEvents: 'none',
                filter: isDark
                  ? 'drop-shadow(0 10px 18px rgba(0, 0, 0, 0.28))'
                  : 'drop-shadow(0 10px 18px rgba(7, 29, 43, 0.14))',
              }}
            >
              <Box
                component="img"
                alt=""
                aria-hidden
                src="/branding/auteura-viewfinder-watermark.svg"
                sx={{
                  width: '100%',
                  height: 'auto',
                  display: 'block',
                  objectFit: 'contain',
                }}
              />
            </Box>
            <Box
              sx={{
                position: 'absolute',
                left: 12,
                right: 12,
                bottom: 12,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 2,
                px: 1.3,
                py: 0.85,
                borderRadius: 999,
                backgroundColor: alpha(theme.palette.background.default, 0.78),
                border: `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
                pointerEvents: 'none',
              }}
            >
              <Typography variant="caption" sx={{ color: '#fffaf4', fontWeight: 700 }}>
                Viewfinder Output
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,250,244,0.72)' }}>
                {activeSourceLabel}
              </Typography>
            </Box>
          </Box>
        </Box>
      </Box>
    </Stack>
  );
}
