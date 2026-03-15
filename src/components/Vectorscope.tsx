import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import type { ScopeAnalysisData } from '../engine/ScopeAnalyzer';

interface VectorscopeProps {
  readonly data: ScopeAnalysisData;
}

export function Vectorscope({ data }: VectorscopeProps): JSX.Element {
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
        Vectorscope
      </Typography>
      <Box
        sx={{
          position: 'relative',
          aspectRatio: '1 / 1',
          borderRadius: '50%',
          border: '1px solid rgba(15,79,99,0.12)',
          overflow: 'hidden',
          background:
            'radial-gradient(circle at center, rgba(32,194,197,0.16), rgba(7,20,28,0.96) 62%), repeating-radial-gradient(circle at center, rgba(255,255,255,0.1) 0 1px, transparent 1px 22%), repeating-linear-gradient(0deg, transparent 0 49.6%, rgba(255,255,255,0.1) 49.6% 50.4%, transparent 50.4% 100%), repeating-linear-gradient(90deg, transparent 0 49.6%, rgba(255,255,255,0.1) 49.6% 50.4%, transparent 50.4% 100%)',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            inset: '50% auto auto 0',
            width: '100%',
            height: 1,
            bgcolor: 'rgba(255,255,255,0.1)',
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            inset: '0 auto 0 50%',
            width: 1,
            height: '100%',
            bgcolor: 'rgba(255,255,255,0.1)',
          }}
        />
        {data.vectorscopePoints.map((point, index) => (
          <Box
            key={`${point.x}-${point.y}-${index}`}
            sx={{
              position: 'absolute',
              left: `${point.x * 100}%`,
              top: `${point.y * 100}%`,
              width: 4,
              height: 4,
              borderRadius: '50%',
              bgcolor: 'var(--color-primary-teal-bright)',
              boxShadow: '0 0 6px rgba(32,194,197,0.55)',
              opacity: 0.42,
              transform: 'translate(-50%, -50%)',
            }}
          />
        ))}
      </Box>
    </Box>
  );
}
