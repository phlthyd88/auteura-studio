import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import type { ScopeAnalysisData } from '../engine/ScopeAnalyzer';

interface RGBParadeProps {
  readonly data: ScopeAnalysisData;
}

function renderParadeBars(values: readonly number[], color: string): JSX.Element {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'end',
        gap: 0.25,
        height: 96,
        flex: 1,
        px: 0.5,
        py: 0.5,
        borderRadius: 2.5,
        bgcolor: 'rgba(6, 16, 23, 0.92)',
        backgroundImage:
          'repeating-linear-gradient(0deg, rgba(255,255,255,0.1) 0 1px, transparent 1px 20px)',
      }}
    >
      {values.map((value: number, index: number) => (
        <Box
          key={`${color}-${index}-${value}`}
          sx={{
            flex: 1,
            height: `${Math.max(2, value * 100)}%`,
            borderRadius: 1,
            background: `linear-gradient(180deg, rgba(255,255,255,0.9), ${color})`,
          }}
        />
      ))}
    </Box>
  );
}

export function RGBParade({ data }: RGBParadeProps): JSX.Element {
  const theme = useTheme();

  return (
    <Box
      sx={{
        p: 1.75,
        borderRadius: 4,
        border: `1px solid ${alpha(theme.palette.auteura.borderSubtle, 0.96)}`,
        background: `linear-gradient(180deg, ${alpha(theme.palette.auteura.surfaceElevated, 0.9)} 0%, ${alpha(
          theme.palette.auteura.surface,
          0.82,
        )} 100%)`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
      }}
    >
      <Typography variant="overline" sx={{ color: 'secondary.light', display: 'block', mb: 0.2 }}>
        Scope
      </Typography>
      <Typography variant="h6" sx={{ mb: 1, color: 'text.primary' }}>
        RGB Parade
      </Typography>
      <Stack spacing={1}>
        {renderParadeBars(data.rgbParade.red, 'rgba(232,120,104,0.88)')}
        {renderParadeBars(data.rgbParade.green, 'rgba(32,194,197,0.88)')}
        {renderParadeBars(data.rgbParade.blue, 'rgba(94,154,242,0.88)')}
      </Stack>
    </Box>
  );
}
