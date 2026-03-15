import {
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { usePersistedState } from '../hooks/usePersistedState';
import {
  ThemeModeContext,
  type ThemeModeContextValue,
  type ThemePreference,
} from './ThemeModeContext';

function getSystemMode(): 'dark' | 'light' {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function' ||
    !window.matchMedia('(prefers-color-scheme: dark)').matches
  ) {
    return 'light';
  }

  return 'dark';
}

export function ThemeModeProvider({ children }: PropsWithChildren): JSX.Element {
  const [themePreference, setThemePreference] = usePersistedState<ThemePreference>(
    'auteura.theme-preference',
    'system',
  );
  const [systemMode, setSystemMode] = useState<'dark' | 'light'>(getSystemMode);

  useEffect((): (() => void) | void => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent): void => {
      setSystemMode(event.matches ? 'dark' : 'light');
    };

    setSystemMode(mediaQuery.matches ? 'dark' : 'light');
    mediaQuery.addEventListener('change', handleChange);

    return (): void => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  const contextValue = useMemo<ThemeModeContextValue>(
    (): ThemeModeContextValue => ({
      resolvedMode: themePreference === 'system' ? systemMode : themePreference,
      setThemePreference,
      themePreference,
    }),
    [setThemePreference, systemMode, themePreference],
  );

  return <ThemeModeContext.Provider value={contextValue}>{children}</ThemeModeContext.Provider>;
}
