import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';

export interface WorkspaceContextValue {
  readonly workspaceId: string;
  readonly workspaceName: string;
  renameWorkspace: (nextName: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: PropsWithChildren): JSX.Element {
  const [workspaceName, setWorkspaceName] = useState<string>('Untitled Session');
  const [workspaceId] = useState<string>(crypto.randomUUID());

  function renameWorkspace(nextName: string): void {
    const trimmedName = nextName.trim();
    setWorkspaceName(trimmedName.length > 0 ? trimmedName : 'Untitled Session');
  }

  const contextValue = useMemo<WorkspaceContextValue>(
    (): WorkspaceContextValue => ({
      workspaceId,
      workspaceName,
      renameWorkspace,
    }),
    [workspaceId, workspaceName],
  );

  return <WorkspaceContext.Provider value={contextValue}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceContext(): WorkspaceContextValue {
  const contextValue = useContext(WorkspaceContext);

  if (contextValue === null) {
    throw new Error('useWorkspaceContext must be used within a WorkspaceProvider.');
  }

  return contextValue;
}
