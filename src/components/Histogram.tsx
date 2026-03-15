import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import type { ScopeAnalysisData } from '../engine/ScopeAnalyzer';

interface HistogramProps {
  readonly data: ScopeAnalysisData;
}

export function Histogram({ data }: HistogramProps): JSX.Element {
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
        Histogram
      </Typography>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'end',
          gap: 0.25,
          height: 120,
          px: 0.5,
          py: 0.75,
          borderRadius: 2.5,
          bgcolor: 'rgba(6, 16, 23, 0.92)',
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(255,255,255,0.1) 0 1px, transparent 1px 24px)',
        }}
      >
        {data.histogram.map((value: number, index: number) => (
          <Box
            key={`${index}-${value}`}
            sx={{
              flex: 1,
              height: `${Math.max(2, value * 100)}%`,
              borderRadius: 1,
              background:
                'linear-gradient(180deg, rgba(255,255,255,0.94), rgba(32,194,197,0.55) 60%, rgba(192,110,40,0.2) 100%)',
            }}
          />
        ))}
      </Box>
    </Box>
  );
}
