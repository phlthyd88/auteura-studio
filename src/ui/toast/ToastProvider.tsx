import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';

export interface ToastMessage {
  readonly id: string;
  readonly message: string;
}

export interface ToastContextValue {
  readonly toasts: readonly ToastMessage[];
  pushToast: (message: string) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: PropsWithChildren): JSX.Element {
  const [toasts, setToasts] = useState<readonly ToastMessage[]>([]);

  function pushToast(message: string): void {
    const nextToast: ToastMessage = {
      id: crypto.randomUUID(),
      message,
    };

    setToasts((currentToasts: readonly ToastMessage[]): readonly ToastMessage[] => [
      ...currentToasts,
      nextToast,
    ]);
  }

  function removeToast(id: string): void {
    setToasts((currentToasts: readonly ToastMessage[]): readonly ToastMessage[] =>
      currentToasts.filter((toast: ToastMessage): boolean => toast.id !== id),
    );
  }

  const contextValue = useMemo<ToastContextValue>(
    (): ToastContextValue => ({
      toasts,
      pushToast,
      removeToast,
    }),
    [toasts],
  );

  return <ToastContext.Provider value={contextValue}>{children}</ToastContext.Provider>;
}

export function useToastContext(): ToastContextValue {
  const contextValue = useContext(ToastContext);

  if (contextValue === null) {
    throw new Error('useToastContext must be used within a ToastProvider.');
  }

  return contextValue;
}
