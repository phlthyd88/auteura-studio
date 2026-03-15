import { useEffect } from 'react';
import { useCameraController } from '../controllers/CameraController';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();

  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    target.isContentEditable
  );
}

export function useKeyboardShortcuts(): void {
  const { cycleCameraDevice } = useCameraController();

  useEffect((): (() => void) => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (isEditableTarget(event.target)) {
        return;
      }

      const normalizedKey = event.key.toLowerCase();

      if (normalizedKey === 'f') {
        event.preventDefault();

        if (document.fullscreenElement === null) {
          if (typeof document.documentElement.requestFullscreen === 'function') {
            void document.documentElement.requestFullscreen().catch((): void => undefined);
          }

          return;
        }

        if (typeof document.exitFullscreen === 'function') {
          void document.exitFullscreen().catch((): void => undefined);
        }

        return;
      }

      if (normalizedKey === 'c') {
        event.preventDefault();
        cycleCameraDevice();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return (): void => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [cycleCameraDevice]);
}
