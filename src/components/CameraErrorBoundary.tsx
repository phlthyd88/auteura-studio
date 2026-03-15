import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react';

interface CameraErrorBoundaryState {
  readonly errorMessage: string | null;
  readonly hasError: boolean;
}

export class CameraErrorBoundary extends Component<
  PropsWithChildren,
  CameraErrorBoundaryState
> {
  public constructor(props: PropsWithChildren) {
    super(props);
    this.state = {
      errorMessage: null,
      hasError: false,
    };
  }

  public static getDerivedStateFromError(error: Error): CameraErrorBoundaryState {
    return {
      errorMessage: error.message,
      hasError: true,
    };
  }

  public componentDidCatch(_error: Error, _errorInfo: ErrorInfo): void {}

  public render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" variant="filled">
          <Typography component="p" variant="subtitle1" sx={{ fontWeight: 700 }}>
            Camera pipeline failed to render.
          </Typography>
          <Typography component="p" variant="body2">
            {this.state.errorMessage ?? 'An unexpected camera subsystem error occurred.'}
          </Typography>
        </Alert>
      </Box>
    );
  }
}
