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

declare module '@mui/material/styles' {
  interface Palette {
    auteura: {
      teal: string;
      tealDark: string;
      tealLight: string;
      copper: string;
      copperLight: string;
      copperDark: string;
      surface: string;
      surfaceElevated: string;
      borderSubtle: string;
      textMuted: string;
    };
  }

  interface PaletteOptions {
    auteura?: {
      teal?: string;
      tealDark?: string;
      tealLight?: string;
      copper?: string;
      copperLight?: string;
      copperDark?: string;
      surface?: string;
      surfaceElevated?: string;
      borderSubtle?: string;
      textMuted?: string;
    };
  }
}

function createFoundationTheme(mode: 'dark' | 'light'): Theme {
  const isDark = mode === 'dark';
  const paperColor = isDark ? '#0f212b' : '#fffaf4';
  const elevatedSurface = isDark ? '#13303a' : '#ffffff';
  const defaultColor = isDark ? '#08141b' : '#f5f1e9';
  const textPrimary = isDark ? '#edf4f4' : '#132534';
  const textSecondary = isDark ? '#a9bec8' : '#476071';
  const borderTint = isDark ? 'rgba(120, 173, 191, 0.16)' : 'rgba(15, 79, 99, 0.08)';
  const auteuraPalette = {
    teal: '#0e5970',
    tealDark: '#0b4658',
    tealLight: '#20c2c5',
    copper: '#c06e28',
    copperLight: '#e9ab74',
    copperDark: '#8f4f19',
    surface: paperColor,
    surfaceElevated: elevatedSurface,
    borderSubtle: borderTint,
    textMuted: textSecondary,
  };

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
      divider: alpha(isDark ? '#e9eef0' : '#0f4f63', isDark ? 0.12 : 0.1),
      auteura: auteuraPalette,
    },
    shape: {
      borderRadius: 16,
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
          ':root': {
            '--color-primary-teal-bright': auteuraPalette.tealLight,
            '--color-accent-copper': auteuraPalette.copper,
          },
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
            borderRadius: 10,
            fontWeight: 700,
            letterSpacing: '0.03em',
            textTransform: 'none',
            '&:focus-visible': {
              outline: '2px solid rgba(32, 194, 197, 0.8)',
              outlineOffset: 2,
            },
          },
          contained: {
            boxShadow: isDark
              ? '0 16px 30px rgba(3, 11, 18, 0.42)'
              : '0 16px 30px rgba(15, 79, 99, 0.18)',
          },
          containedPrimary: {
            background: `linear-gradient(135deg, ${auteuraPalette.tealLight}, ${auteuraPalette.teal})`,
          },
          containedSecondary: {
            background: `linear-gradient(135deg, ${auteuraPalette.copperLight}, ${auteuraPalette.copper})`,
          },
          outlined: {
            backgroundColor: alpha(elevatedSurface, isDark ? 0.52 : 0.68),
            borderColor: auteuraPalette.borderSubtle,
            '&:hover': {
              backgroundColor: alpha(elevatedSurface, isDark ? 0.74 : 0.84),
              borderColor: alpha(auteuraPalette.tealLight, 0.44),
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            backgroundColor: auteuraPalette.surface,
            border: `1px solid ${auteuraPalette.borderSubtle}`,
            boxShadow: isDark
              ? '0 10px 30px rgba(0,0,0,0.18)'
              : '0 10px 30px rgba(15,79,99,0.08)',
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            backgroundColor: auteuraPalette.surface,
            border: `1px solid ${auteuraPalette.borderSubtle}`,
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 999,
            fontWeight: 700,
            border: `1px solid ${auteuraPalette.borderSubtle}`,
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          indicator: {
            height: 3,
            borderRadius: 999,
            backgroundColor: auteuraPalette.copper,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: alpha(paperColor, isDark ? 0.94 : 0.92),
            borderColor: auteuraPalette.borderSubtle,
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
            backgroundColor: alpha(elevatedSurface, isDark ? 0.72 : 0.68),
            '& fieldset': {
              borderColor: borderTint,
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: '#20c2c5',
              boxShadow: '0 0 0 1px rgba(32, 194, 197, 0.25)',
            },
          },
        },
      },
      MuiSlider: {
        styleOverrides: {
          thumb: {
            boxShadow: `0 0 0 6px ${alpha(auteuraPalette.copper, 0.16)}`,
          },
          track: {
            border: 'none',
            background: `linear-gradient(90deg, ${auteuraPalette.copperLight}, ${auteuraPalette.copper})`,
          },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            borderColor: auteuraPalette.borderSubtle,
            '&.Mui-selected': {
              backgroundColor: alpha(auteuraPalette.tealLight, 0.14),
              color: textPrimary,
            },
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: alpha(defaultColor, 0.94),
            border: `1px solid ${auteuraPalette.borderSubtle}`,
            color: textPrimary,
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            '&:focus-visible': {
              outline: '2px solid rgba(32, 194, 197, 0.8)',
              outlineOffset: 2,
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
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            '&.Mui-selected': {
              backgroundColor: alpha(auteuraPalette.copper, 0.14),
            },
            '&.Mui-selected:hover': {
              backgroundColor: alpha(auteuraPalette.copper, 0.2),
            },
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
