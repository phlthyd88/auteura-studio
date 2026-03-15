import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider, alpha, createTheme, type Theme } from '@mui/material/styles';
import { useMemo, type PropsWithChildren } from 'react';
import { CameraErrorBoundary } from '../components/CameraErrorBoundary';
import { AudioProvider } from '../context/AudioContext';
import { AIController } from '../controllers/AIController';
import { CameraController } from '../controllers/CameraController';
import { RecordingController } from '../controllers/RecordingController';
import { RenderController } from '../controllers/RenderController';
import { TimelineController } from '../controllers/TimelineController';
import { PerformanceModeProvider } from './PerformanceModeProvider';
import { UIStateProvider } from './UIStateProvider';
import { WorkspaceProvider } from './WorkspaceProvider';
import { composeProviders, type ComposableProvider } from './composeProviders';
import { ToastProvider } from '../ui/toast/ToastProvider';
import { ThemeModeProvider } from './ThemeModeProvider';
import { useThemeMode } from './ThemeModeContext';
import { AppCompatibilityProvider } from './AppCompatibilityProvider';

function createFoundationTheme(mode: 'dark' | 'light'): Theme {
  const isDark = mode === 'dark';
  const paperColor = isDark ? '#10202b' : '#fffaf4';
  const defaultColor = isDark ? '#08131b' : '#f5f1e9';
  const textPrimary = isDark ? '#edf4f4' : '#132534';
  const textSecondary = isDark ? '#a9bec8' : '#476071';
  const borderTint = isDark ? 'rgba(120, 173, 191, 0.16)' : 'rgba(15, 79, 99, 0.08)';

  return createTheme({
    palette: {
      mode,
      background: {
        default: defaultColor,
        paper: paperColor,
      },
      primary: {
        main: '#0e5970',
        dark: '#0b4658',
        light: '#20c2c5',
      },
      secondary: {
        main: '#c06e28',
        dark: '#8f4f19',
        light: '#e9ab74',
      },
      text: {
        primary: textPrimary,
        secondary: textSecondary,
      },
    },
    shape: {
      borderRadius: 24,
    },
    typography: {
      fontFamily: '"Avenir Next", "Trebuchet MS", "Segoe UI", sans-serif',
      h3: {
        fontWeight: 800,
        letterSpacing: '-0.04em',
      },
      h4: {
        fontWeight: 800,
        letterSpacing: '-0.03em',
      },
      h5: {
        fontWeight: 800,
        letterSpacing: '-0.02em',
      },
      h6: {
        fontWeight: 700,
        letterSpacing: '-0.01em',
      },
      overline: {
        fontWeight: 700,
        letterSpacing: '0.24em',
      },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            background: isDark
              ? 'radial-gradient(circle at top left, rgba(32, 194, 197, 0.14), transparent 24%), radial-gradient(circle at 84% 12%, rgba(192, 110, 40, 0.12), transparent 18%), linear-gradient(180deg, #10202a 0%, #08131b 100%)'
              : 'radial-gradient(circle at top left, rgba(32, 194, 197, 0.16), transparent 28%), radial-gradient(circle at 84% 12%, rgba(192, 110, 40, 0.18), transparent 22%), linear-gradient(180deg, #fbf7f1 0%, #f3eee5 100%)',
          },
          '#root': {
            minHeight: '100dvh',
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 999,
            fontWeight: 700,
            letterSpacing: '0.03em',
            textTransform: 'none',
          },
          contained: {
            boxShadow: isDark
              ? '0 16px 30px rgba(3, 11, 18, 0.42)'
              : '0 16px 30px rgba(15, 79, 99, 0.18)',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 999,
            fontWeight: 700,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: alpha(paperColor, isDark ? 0.94 : 0.92),
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: 18,
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: alpha(paperColor, isDark ? 0.52 : 0.56),
            '& fieldset': {
              borderColor: borderTint,
            },
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            minHeight: 40,
          },
        },
      },
    },
  });
}

function MaterialThemeProvider({ children }: PropsWithChildren): JSX.Element {
  const { resolvedMode } = useThemeMode();
  const foundationTheme = useMemo(
    () => createFoundationTheme(resolvedMode),
    [resolvedMode],
  );

  return (
    <ThemeProvider theme={foundationTheme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}

const ComposedAppProviders = composeProviders([
  ThemeModeProvider,
  MaterialThemeProvider,
  AppCompatibilityProvider,
  ToastProvider,
  WorkspaceProvider,
  UIStateProvider,
  PerformanceModeProvider,
  AudioProvider,
  CameraController,
  CameraErrorBoundary as ComposableProvider,
  RenderController,
  AIController,
  RecordingController,
  TimelineController,
]);

export function AppProviders({ children }: PropsWithChildren): JSX.Element {
  return <ComposedAppProviders>{children}</ComposedAppProviders>;
}
