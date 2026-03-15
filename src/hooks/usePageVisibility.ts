import { useEffect, useState } from 'react';

export function usePageVisibility(): boolean {
  const [isPageHidden, setIsPageHidden] = useState<boolean>(
    typeof document !== 'undefined' ? document.visibilityState === 'hidden' : false,
  );

  useEffect((): (() => void) => {
    function handleVisibilityChange(): void {
      setIsPageHidden(document.visibilityState === 'hidden');
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return (): void => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return isPageHidden;
}
