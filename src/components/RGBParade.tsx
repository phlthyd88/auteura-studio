import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import type { ScopeAnalysisData } from '../engine/ScopeAnalyzer';

interface RGBParadeProps {
  readonly data: ScopeAnalysisData;
}

function renderParadeBars(values: readonly number[], color: string): JSX.Element {
  return (
    <Box sx={{ display: 'flex', alignItems: 'end', gap: 0.25, height: 96, flex: 1 }}>
      {values.map((value: number, index: number) => (
        <Box
          key={`${color}-${index}-${value}`}
          sx={{
            flex: 1,
            height: `${Math.max(2, value * 100)}%`,
            borderRadius: 1,
            bgcolor: color,
          }}
        />
      ))}
    </Box>
  );
}

export function RGBParade({ data }: RGBParadeProps): JSX.Element {
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
        RGB Parade
      </Typography>
      <Stack spacing={1}>
        {renderParadeBars(data.rgbParade.red, 'rgba(248,113,113,0.85)')}
        {renderParadeBars(data.rgbParade.green, 'rgba(74,222,128,0.85)')}
        {renderParadeBars(data.rgbParade.blue, 'rgba(96,165,250,0.85)')}
      </Stack>
    </Box>
  );
}
