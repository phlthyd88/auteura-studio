import { createContext, useContext } from 'react';

export type ThemePreference = 'dark' | 'light' | 'system';

export interface ThemeModeContextValue {
  readonly resolvedMode: 'dark' | 'light';
  readonly themePreference: ThemePreference;
  setThemePreference: (nextPreference: ThemePreference) => void;
}

export const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

export function useThemeMode(): ThemeModeContextValue {
  const contextValue = useContext(ThemeModeContext);

  if (contextValue === null) {
    throw new Error('useThemeMode must be used within a ThemeModeProvider.');
  }

  return contextValue;
}
