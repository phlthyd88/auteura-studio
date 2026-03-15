import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import {
  AppCompatibilityContext,
  type AppCompatibilityContextValue,
} from './AppCompatibilityContext';
import {
  getAppCompatibilitySnapshot,
  registerCurrentClientCompatibility,
} from '../services/AppCompatibilityService';

export function AppCompatibilityProvider({ children }: PropsWithChildren): JSX.Element {
  const [snapshot, setSnapshot] = useState(getAppCompatibilitySnapshot);

  const refreshCompatibility = useCallback((): void => {
    setSnapshot(getAppCompatibilitySnapshot());
  }, []);

  useEffect(() => {
    setSnapshot(registerCurrentClientCompatibility());

    const handleCompatibilityUpdate = (): void => {
      setSnapshot(getAppCompatibilitySnapshot());
    };

    window.addEventListener('storage', handleCompatibilityUpdate);
    window.addEventListener('auteura:compatibility-updated', handleCompatibilityUpdate);

    return (): void => {
      window.removeEventListener('storage', handleCompatibilityUpdate);
      window.removeEventListener('auteura:compatibility-updated', handleCompatibilityUpdate);
    };
  }, []);

  const contextValue = useMemo<AppCompatibilityContextValue>(
    (): AppCompatibilityContextValue => ({
      ...snapshot,
      refreshCompatibility,
    }),
    [refreshCompatibility, snapshot],
  );

  return (
    <AppCompatibilityContext.Provider value={contextValue}>
      {children}
    </AppCompatibilityContext.Provider>
  );
}
