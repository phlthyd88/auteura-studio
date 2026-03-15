import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import OpenInBrowserRoundedIcon from '@mui/icons-material/OpenInBrowserRounded';
import PictureInPictureAltRoundedIcon from '@mui/icons-material/PictureInPictureAltRounded';
import RadioButtonUncheckedRoundedIcon from '@mui/icons-material/RadioButtonUncheckedRounded';
import ScreenShareRoundedIcon from '@mui/icons-material/ScreenShareRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { useMemo, useState } from 'react';
import { useRenderController } from '../controllers/RenderController';
import { StudioDeckSection } from './StudioDeckSection';

const extensionFolderPath = '/home/jlf88/auteura/extensions/auteura-browser-camera';

interface BrowserSupportSnapshot {
  readonly browserLabel: string;
  readonly isChromiumLike: boolean;
  readonly isDesktopLike: boolean;
}

interface SetupStep {
  readonly body: string;
  readonly complete: boolean;
  readonly title: string;
}

function detectBrowserSupport(): BrowserSupportSnapshot {
  if (typeof navigator === 'undefined') {
    return {
      browserLabel: 'Unknown browser',
      isChromiumLike: false,
      isDesktopLike: false,
    };
  }

  const userAgent = navigator.userAgent;
  const isEdge = /Edg\//.test(userAgent);
  const isChromium = /Chrome\//.test(userAgent) || /Chromium\//.test(userAgent) || isEdge;
  const isFirefox = /Firefox\//.test(userAgent);
  const isSafari =
    /Safari\//.test(userAgent) && !/Chrome\//.test(userAgent) && !/Chromium\//.test(userAgent);
  const isMobile = /Android|iPhone|iPad|Mobile/i.test(userAgent);

  return {
    browserLabel: isEdge
      ? 'Microsoft Edge'
      : isChromium
        ? 'Chrome / Chromium'
        : isFirefox
          ? 'Firefox'
          : isSafari
            ? 'Safari'
            : 'Unknown browser',
    isChromiumLike: isChromium,
    isDesktopLike: !isMobile,
  };
}

function SetupStatusBlock({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): JSX.Element {
  return (
    <Box
      sx={{
        p: 1.15,
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

export function BrowserCameraSetupPanel(): JSX.Element {
  const {
    pictureInPictureConfig,
    setPictureInPictureConfig,
    virtualOutputStatus,
  } = useRenderController();
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'error'>('idle');
  const [copyUrlState, setCopyUrlState] = useState<'idle' | 'done' | 'error'>('idle');
  const browserSupport = useMemo(detectBrowserSupport, []);

  const setupSteps = useMemo<readonly SetupStep[]>(
    () => [
      {
        body: `Load the unpacked extension from ${extensionFolderPath} in chrome://extensions.`,
        complete: virtualOutputStatus.extensionDetected,
        title: 'Install the browser camera extension',
      },
      {
        body: 'Keep Auteura open on localhost so the browser-camera host can register.',
        complete: virtualOutputStatus.hostRegistered,
        title: 'Register the Auteura host',
      },
      {
        body: 'Open Google Meet and choose “Auteura Browser Camera” as the video source.',
        complete: virtualOutputStatus.clientCount > 0,
        title: 'Connect a supported site',
      },
    ],
    [
      virtualOutputStatus.clientCount,
      virtualOutputStatus.extensionDetected,
      virtualOutputStatus.hostRegistered,
    ],
  );

  const canUseBrowserCamera = browserSupport.isChromiumLike && browserSupport.isDesktopLike;
  const shouldPreferFallback = !canUseBrowserCamera || !virtualOutputStatus.extensionDetected;

  const handleCopyPath = async (): Promise<void> => {
    if (
      typeof navigator === 'undefined' ||
      navigator.clipboard === undefined ||
      typeof navigator.clipboard.writeText !== 'function'
    ) {
      setCopyState('error');
      return;
    }

    try {
      await navigator.clipboard.writeText(extensionFolderPath);
      setCopyState('done');
    } catch {
      setCopyState('error');
    }
  };

  const handleCopyAppUrl = async (): Promise<void> => {
    if (
      typeof navigator === 'undefined' ||
      navigator.clipboard === undefined ||
      typeof navigator.clipboard.writeText !== 'function' ||
      typeof window === 'undefined'
    ) {
      setCopyUrlState('error');
      return;
    }

    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyUrlState('done');
    } catch {
      setCopyUrlState('error');
    }
  };

  const handleOpenMeet = (): void => {
    if (typeof window === 'undefined') {
      return;
    }

    window.open('https://meet.google.com', '_blank', 'noopener,noreferrer');
  };

  const enableShareReadyPip = (): void => {
    setPictureInPictureConfig({
      ...pictureInPictureConfig,
      anchor: 'top-right',
      enabled: true,
      opacity: 0.96,
      showBorder: true,
      source: 'processed-output',
    });
  };

  return (
    <StudioDeckSection
      kicker="Browser Camera"
      title="Setup"
      icon={<OpenInBrowserRoundedIcon fontSize="small" />}
      actions={
        <Button
          color={copyState === 'error' ? 'warning' : 'primary'}
          onClick={(): void => {
            void handleCopyPath();
          }}
          size="small"
          startIcon={<ContentCopyRoundedIcon fontSize="small" />}
          variant="outlined"
        >
          {copyState === 'done' ? 'Path copied' : 'Copy path'}
        </Button>
      }
    >
      <Stack spacing={1.2}>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          <Chip
            color={canUseBrowserCamera ? 'success' : 'warning'}
            label={canUseBrowserCamera ? `Browser: ${browserSupport.browserLabel}` : `Browser limited: ${browserSupport.browserLabel}`}
            size="small"
          />
          <Chip
            color={virtualOutputStatus.extensionDetected ? 'success' : 'default'}
            label={
              virtualOutputStatus.extensionDetected
                ? 'Extension detected'
                : 'Extension not detected'
            }
            size="small"
          />
          <Chip
            color={virtualOutputStatus.hostRegistered ? 'success' : 'default'}
            label={virtualOutputStatus.hostRegistered ? 'Host ready' : 'Host waiting'}
            size="small"
          />
        </Stack>

        {!canUseBrowserCamera ? (
          <Alert severity="warning" variant="outlined">
            Browser camera output currently targets desktop Chromium browsers. On this browser,
            use window share as the fallback.
          </Alert>
        ) : null}
        {shouldPreferFallback ? (
          <Alert severity="info" variant="outlined">
            Browser-camera routing is not fully ready on this client. Use the fallback workflow
            below to share Auteura into Meet or another desktop app without losing the processed
            output.
          </Alert>
        ) : null}

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 1,
          }}
        >
          <SetupStatusBlock label="Supported now" value="Google Meet" />
          <SetupStatusBlock label="Planned next" value="Zoom Web • Teams Web" />
          <SetupStatusBlock
            label="Fallback"
            value="Window share / PiP when the extension path is unavailable"
          />
          <SetupStatusBlock
            label="Current route"
            value={
              virtualOutputStatus.clientCount > 0
                ? 'Browser camera active'
                : virtualOutputStatus.hostRegistered
                  ? 'Ready for browser camera'
                  : 'Fallback recommended'
            }
          />
        </Box>

        <Stack spacing={1}>
          {setupSteps.map((step, index) => (
            <Box
              key={step.title}
              sx={{
                p: 1.2,
                borderRadius: '18px',
                border: '1px solid rgba(15,79,99,0.08)',
                bgcolor: alpha('#fffaf4', 0.62),
              }}
            >
              <Stack direction="row" spacing={1.1} alignItems="flex-start">
                <Box sx={{ pt: 0.15, color: step.complete ? 'success.main' : 'text.secondary' }}>
                  {step.complete ? (
                    <CheckCircleRoundedIcon fontSize="small" />
                  ) : (
                    <RadioButtonUncheckedRoundedIcon fontSize="small" />
                  )}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle2">
                    {index + 1}. {step.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {step.body}
                  </Typography>
                </Box>
              </Stack>
            </Box>
          ))}
        </Stack>

        <Alert severity={virtualOutputStatus.lastError === null ? 'info' : 'warning'} variant="outlined">
          {virtualOutputStatus.lastError === null
            ? 'Auteura only presents itself as a browser camera inside supported web apps. Native desktop apps still require window share or a separate native-helper track.'
            : `Host status: ${virtualOutputStatus.lastError}`}
        </Alert>

        <Box
          sx={{
            p: 1.3,
            borderRadius: '18px',
            border: '1px solid rgba(15,79,99,0.08)',
            bgcolor: alpha('#fffaf4', 0.62),
          }}
        >
          <Stack spacing={1.15}>
            <Stack direction="row" spacing={1} alignItems="center">
              <ScreenShareRoundedIcon fontSize="small" color="primary" />
              <Typography variant="subtitle2">Fallback Workflow</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              If the extension path is unavailable, keep Auteura open and share this browser tab or
              the full Auteura window into Meet, Zoom, Teams, or desktop apps.
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <Button
                onClick={handleOpenMeet}
                size="small"
                startIcon={<OpenInBrowserRoundedIcon fontSize="small" />}
                variant="contained"
              >
                Open Meet
              </Button>
              <Button
                color={copyUrlState === 'error' ? 'warning' : 'primary'}
                onClick={(): void => {
                  void handleCopyAppUrl();
                }}
                size="small"
                startIcon={<ContentCopyRoundedIcon fontSize="small" />}
                variant="outlined"
              >
                {copyUrlState === 'done' ? 'App URL copied' : 'Copy app URL'}
              </Button>
              <Button
                onClick={enableShareReadyPip}
                size="small"
                startIcon={<PictureInPictureAltRoundedIcon fontSize="small" />}
                variant={pictureInPictureConfig.enabled ? 'contained' : 'outlined'}
              >
                {pictureInPictureConfig.enabled ? 'PiP ready' : 'Enable PiP overlay'}
              </Button>
            </Stack>
            <Stack spacing={0.7}>
              <Typography variant="caption" color="text.secondary">
                1. Keep the Auteura viewfinder visible with the layout you want to present.
              </Typography>
              <Typography variant="caption" color="text.secondary">
                2. In the meeting app, choose screen share and pick the Auteura tab or window.
              </Typography>
              <Typography variant="caption" color="text.secondary">
                3. If you need a confidence monitor, enable the PiP overlay so the processed output
                remains presentation-ready while sharing.
              </Typography>
            </Stack>
          </Stack>
        </Box>

        <Stack direction="row" spacing={1} alignItems="center">
          <WarningAmberRoundedIcon color="warning" fontSize="small" />
          <Typography variant="body2" color="text.secondary">
            If the extension is installed after Auteura loads, refresh the tab once so the host bridge can be detected immediately.
          </Typography>
        </Stack>
      </Stack>
    </StudioDeckSection>
  );
}
