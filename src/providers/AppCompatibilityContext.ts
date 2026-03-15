import { createContext, useContext } from 'react';
import type { AppCompatibilitySnapshot } from '../services/AppCompatibilityService';

export interface AppCompatibilityContextValue extends AppCompatibilitySnapshot {
  readonly refreshCompatibility: () => void;
}

export const AppCompatibilityContext = createContext<AppCompatibilityContextValue | null>(null);

export function useAppCompatibility(): AppCompatibilityContextValue {
  const contextValue = useContext(AppCompatibilityContext);

  if (contextValue === null) {
    throw new Error('useAppCompatibility must be used within an AppCompatibilityProvider.');
  }

  return contextValue;
}

