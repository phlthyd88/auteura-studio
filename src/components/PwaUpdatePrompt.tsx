import Button from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useEffect, useMemo, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { useRecordingController } from '../controllers/RecordingController';

export function PwaUpdatePrompt(): JSX.Element | null {
  const { isProcessingCapture, isRecording, isTimelapseCapturing } = useRecordingController();
  const [isDismissed, setIsDismissed] = useState(false);
  const [isOfflineReady, setIsOfflineReady] = useState(false);
  const [isUpdateApplying, setIsUpdateApplying] = useState(false);
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [updateServiceWorker, setUpdateServiceWorker] = useState<(() => Promise<void>) | null>(null);

  const hasActiveCapture = isRecording || isProcessingCapture || isTimelapseCapturing;
  const statusMessage = useMemo<string>(() => {
    if (isUpdateAvailable) {
      if (hasActiveCapture) {
        return 'A new version is ready. Finish the active capture before restarting Auteura.';
      }

      return 'A new version of Auteura is ready. Restart to apply the update cleanly.';
    }

    return 'Auteura is now available offline on this device.';
  }, [hasActiveCapture, isUpdateAvailable]);

  useEffect((): void => {
    if (!import.meta.env.PROD || typeof window === 'undefined') {
      return;
    }

    const triggerServiceWorkerUpdate = registerSW({
      immediate: true,
      onNeedRefresh(): void {
        setIsDismissed(false);
        setIsUpdateAvailable(true);
      },
      onOfflineReady(): void {
        setIsDismissed(false);
        setIsOfflineReady(true);
      },
    });

    setUpdateServiceWorker((): (() => Promise<void>) => async (): Promise<void> => {
      await triggerServiceWorkerUpdate(true);
    });
  }, []);

  if (!import.meta.env.PROD) {
    return null;
  }

  return (
    <Snackbar
      anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      autoHideDuration={isUpdateAvailable ? null : 4_000}
      onClose={(_event, reason): void => {
        if (reason === 'clickaway') {
          return;
        }

        setIsDismissed(true);
        setIsOfflineReady(false);
      }}
      open={!isDismissed && (isUpdateAvailable || isOfflineReady)}
    >
      <Alert
        action={
          isUpdateAvailable ? (
            <Stack direction="row" spacing={1}>
              <Button
                color="inherit"
                disabled={hasActiveCapture || isUpdateApplying || updateServiceWorker === null}
                onClick={(): void => {
                  if (updateServiceWorker === null) {
                    return;
                  }

                  setIsUpdateApplying(true);
                  void updateServiceWorker();
                }}
                size="small"
                variant="outlined"
              >
                {isUpdateApplying ? 'Restarting…' : 'Update now'}
              </Button>
              <Button
                color="inherit"
                onClick={(): void => setIsDismissed(true)}
                size="small"
              >
                Later
              </Button>
            </Stack>
          ) : undefined
        }
        onClose={(): void => {
          setIsDismissed(true);
          setIsOfflineReady(false);
        }}
        severity={isUpdateAvailable ? 'info' : 'success'}
        sx={{ alignItems: 'flex-start', width: 420, maxWidth: 'calc(100vw - 32px)' }}
        variant="filled"
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.3 }}>
          {isUpdateAvailable ? 'Update ready' : 'Offline ready'}
        </Typography>
        <Typography variant="body2">
          {statusMessage}
        </Typography>
      </Alert>
    </Snackbar>
  );
}
