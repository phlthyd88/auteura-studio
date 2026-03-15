import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import type { ScopeAnalysisData } from '../engine/ScopeAnalyzer';

interface HistogramProps {
  readonly data: ScopeAnalysisData;
}

export function Histogram({ data }: HistogramProps): JSX.Element {
  return (
    <Box
      sx={{
        p: 1.75,
        borderRadius: 4,
        border: '1px solid rgba(15, 79, 99, 0.08)',
        bgcolor: alpha('#fffaf4', 0.82),
        boxShadow: '0 18px 40px rgba(15, 79, 99, 0.08)',
      }}
    >
      <Typography variant="overline" sx={{ color: 'secondary.dark', display: 'block', mb: 0.2 }}>
        Scope
      </Typography>
      <Typography variant="h6" sx={{ mb: 1 }}>
        Histogram
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'end', gap: 0.25, height: 120 }}>
        {data.histogram.map((value: number, index: number) => (
          <Box
            key={`${index}-${value}`}
            sx={{
              flex: 1,
              height: `${Math.max(2, value * 100)}%`,
              borderRadius: 1,
              background:
                'linear-gradient(180deg, rgba(248,250,252,0.95), rgba(148,163,184,0.25))',
            }}
          />
        ))}
      </Box>
    </Box>
  );
}
