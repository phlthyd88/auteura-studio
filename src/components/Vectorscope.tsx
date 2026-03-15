import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import type { ScopeAnalysisData } from '../engine/ScopeAnalyzer';

interface VectorscopeProps {
  readonly data: ScopeAnalysisData;
}

export function Vectorscope({ data }: VectorscopeProps): JSX.Element {
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
            'radial-gradient(circle, rgba(15,79,99,0.06) 1px, transparent 1px), radial-gradient(circle at center, rgba(192,110,40,0.14), rgba(13,59,79,0.92))',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            inset: '50% auto auto 0',
            width: '100%',
            height: 1,
            bgcolor: 'rgba(255,255,255,0.12)',
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            inset: '0 auto 0 50%',
            width: 1,
            height: '100%',
            bgcolor: 'rgba(255,255,255,0.12)',
          }}
        />
        {data.vectorscopePoints.map((point, index) => (
          <Box
            key={`${point.x}-${point.y}-${index}`}
            sx={{
              position: 'absolute',
              left: `${point.x * 100}%`,
              top: `${point.y * 100}%`,
              width: 3,
              height: 3,
              borderRadius: '50%',
              bgcolor: 'rgba(34,197,94,0.45)',
              transform: 'translate(-50%, -50%)',
            }}
          />
        ))}
      </Box>
    </Box>
  );
}
