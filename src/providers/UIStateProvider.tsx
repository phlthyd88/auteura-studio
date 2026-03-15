import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';

export type DrawerTab = 'ADJUST' | 'TIMELINE' | 'AI' | 'VIEW' | 'MEDIA' | 'SETTINGS';

export interface UIStateContextValue {
  readonly activeDrawerTab: DrawerTab;
  readonly isDrawerOpen: boolean;
  setActiveDrawerTab: (nextTab: DrawerTab) => void;
  setDrawerOpen: (nextState: boolean) => void;
}

const UIStateContext = createContext<UIStateContextValue | null>(null);

export function UIStateProvider({ children }: PropsWithChildren): JSX.Element {
  const [activeDrawerTab, setActiveDrawerTab] = useState<DrawerTab>('ADJUST');
  const [isDrawerOpen, setDrawerOpen] = useState<boolean>(true);

  const contextValue = useMemo<UIStateContextValue>(
    (): UIStateContextValue => ({
      activeDrawerTab,
      isDrawerOpen,
      setActiveDrawerTab,
      setDrawerOpen,
    }),
    [activeDrawerTab, isDrawerOpen],
  );

  return <UIStateContext.Provider value={contextValue}>{children}</UIStateContext.Provider>;
}

export function useUIStateContext(): UIStateContextValue {
  const contextValue = useContext(UIStateContext);

  if (contextValue === null) {
    throw new Error('useUIStateContext must be used within a UIStateProvider.');
  }

  return contextValue;
}
