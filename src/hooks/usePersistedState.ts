import { useEffect, useState } from 'react';

function readPersistedValue<T>(storageKey: string, fallbackValue: T): T {
  if (typeof window === 'undefined') {
    return fallbackValue;
  }

  try {
    const storedValue = window.localStorage.getItem(storageKey);

    if (storedValue === null) {
      return fallbackValue;
    }

    return JSON.parse(storedValue) as T;
  } catch {
    return fallbackValue;
  }
}

export function usePersistedState<T>(
  storageKey: string,
  initialValue: T,
): readonly [T, (nextValue: T) => void] {
  const [state, setState] = useState<T>(() => readPersistedValue(storageKey, initialValue));

  useEffect((): void => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // Ignore persistence failures so runtime state continues working.
    }
  }, [state, storageKey]);

  return [state, setState] as const;
}
