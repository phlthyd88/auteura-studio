import Button from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useEffect, useMemo, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { useRecordingController } from '../controllers/RecordingController';

const updatePromptStorageKey = 'auteura-pwa-update-pending';
const updatePromptReminderDelayMs = 15 * 60 * 1000;

interface StoredUpdatePromptState {
  readonly detectedAt: number;
  readonly dismissedAt: number | null;
}

function canUseWindowStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readStoredUpdatePromptState(): StoredUpdatePromptState | null {
  if (!canUseWindowStorage()) {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(updatePromptStorageKey);

    if (rawValue === null) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue) as {
      readonly detectedAt?: unknown;
      readonly dismissedAt?: unknown;
    };

    if (typeof parsedValue.detectedAt !== 'number' || !Number.isFinite(parsedValue.detectedAt)) {
      return null;
    }

    if (
      parsedValue.dismissedAt !== null &&
      parsedValue.dismissedAt !== undefined &&
      (typeof parsedValue.dismissedAt !== 'number' || !Number.isFinite(parsedValue.dismissedAt))
    ) {
      return null;
    }

    return {
      detectedAt: parsedValue.detectedAt,
      dismissedAt:
        parsedValue.dismissedAt === null || parsedValue.dismissedAt === undefined
          ? null
          : parsedValue.dismissedAt,
    };
  } catch {
    return null;
  }
}

function writeStoredUpdatePromptState(nextState: StoredUpdatePromptState | null): void {
  if (!canUseWindowStorage()) {
    return;
  }

  try {
    if (nextState === null) {
      window.localStorage.removeItem(updatePromptStorageKey);
      return;
    }

    window.localStorage.setItem(updatePromptStorageKey, JSON.stringify(nextState));
  } catch {
    // Ignore storage write failures and keep the prompt ephemeral.
  }
}

function resolveUpdatePromptReminderDelay(
  now: number,
  storedState: StoredUpdatePromptState,
): number {
  if (storedState.dismissedAt === null) {
    return 0;
  }

  return Math.max(0, updatePromptReminderDelayMs - (now - storedState.dismissedAt));
}

export function PwaUpdatePrompt(): JSX.Element | null {
  const { isProcessingCapture, isRecording, isTimelapseCapturing } = useRecordingController();
  const [isDismissed, setIsDismissed] = useState(false);
  const [isOfflineReady, setIsOfflineReady] = useState(false);
  const [isUpdateApplying, setIsUpdateApplying] = useState(false);
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [updateServiceWorker, setUpdateServiceWorker] = useState<(() => Promise<void>) | null>(null);
  const reminderTimeoutIdRef = useRef<number | null>(null);

  const hasActiveCapture = isRecording || isProcessingCapture || isTimelapseCapturing;
  const shouldRenderPrompt = import.meta.env.PROD || import.meta.env.MODE === 'test';
  const statusMessage = useMemo<string>(() => {
    if (isUpdateAvailable) {
      if (hasActiveCapture) {
        return 'A new version is ready. Finish the active capture before restarting Auteura.';
      }

      return 'A new version of Auteura is ready. Restart to apply the update cleanly.';
    }

    return 'Auteura is now available offline on this device.';
  }, [hasActiveCapture, isUpdateAvailable]);

  useEffect((): (() => void) => {
    return (): void => {
      if (reminderTimeoutIdRef.current !== null) {
        window.clearTimeout(reminderTimeoutIdRef.current);
        reminderTimeoutIdRef.current = null;
      }
    };
  }, []);

  useEffect((): void => {
    if (!shouldRenderPrompt || typeof window === 'undefined') {
      return;
    }

    const scheduleReminder = (delayMs: number): void => {
      if (reminderTimeoutIdRef.current !== null) {
        window.clearTimeout(reminderTimeoutIdRef.current);
      }

      reminderTimeoutIdRef.current = window.setTimeout((): void => {
        reminderTimeoutIdRef.current = null;
        setIsDismissed(false);
      }, delayMs);
    };

    const storedState = readStoredUpdatePromptState();

    if (storedState !== null) {
      setIsUpdateAvailable(true);
      const reminderDelayMs = resolveUpdatePromptReminderDelay(Date.now(), storedState);

      if (reminderDelayMs === 0) {
        setIsDismissed(false);
      } else {
        setIsDismissed(true);
        scheduleReminder(reminderDelayMs);
      }
    }

    const triggerServiceWorkerUpdate = registerSW({
      immediate: true,
      onNeedRefresh(): void {
        writeStoredUpdatePromptState({
          detectedAt: Date.now(),
          dismissedAt: null,
        });
        setIsDismissed(false);
        setIsUpdateAvailable(true);
      },
      onOfflineReady(): void {
        setIsDismissed(false);
        setIsOfflineReady(true);
      },
    });

    setUpdateServiceWorker((): (() => Promise<void>) => async (): Promise<void> => {
      writeStoredUpdatePromptState(null);
      await triggerServiceWorkerUpdate(true);
    });
  }, [shouldRenderPrompt]);

  if (!shouldRenderPrompt) {
    return null;
  }

  const dismissPrompt = (): void => {
    setIsDismissed(true);

    if (!isUpdateAvailable) {
      setIsOfflineReady(false);
      return;
    }

    writeStoredUpdatePromptState({
      detectedAt: readStoredUpdatePromptState()?.detectedAt ?? Date.now(),
      dismissedAt: Date.now(),
    });

    if (reminderTimeoutIdRef.current !== null) {
      window.clearTimeout(reminderTimeoutIdRef.current);
    }

    reminderTimeoutIdRef.current = window.setTimeout((): void => {
      reminderTimeoutIdRef.current = null;
      setIsDismissed(false);
    }, updatePromptReminderDelayMs);
  };

  return (
    <Snackbar
      anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      autoHideDuration={isUpdateAvailable ? null : 4_000}
      onClose={(_event, reason): void => {
        if (reason === 'clickaway') {
          return;
        }

        dismissPrompt();
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
                onClick={dismissPrompt}
                size="small"
              >
                Later
              </Button>
            </Stack>
          ) : undefined
        }
        onClose={(): void => {
          dismissPrompt();
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
