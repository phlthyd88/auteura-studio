import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';

export const InstrumentPanel = styled(Box)(({ theme }) => ({
  position: 'relative',
  padding: theme.spacing(2),
  borderRadius: 16,
  overflow: 'hidden',
  background: `linear-gradient(180deg, ${theme.palette.auteura.surfaceElevated}, ${theme.palette.auteura.surface})`,
  border: `1px solid ${theme.palette.auteura.borderSubtle}`,
  boxShadow:
    theme.palette.mode === 'dark'
      ? 'inset 0 1px 0 rgba(255,255,255,0.03), 0 16px 32px rgba(0, 0, 0, 0.24)'
      : '0 18px 40px rgba(15, 79, 99, 0.08)',
}));

export const SectionEyebrow = styled(Typography)(({ theme }) => ({
  display: 'block',
  marginBottom: theme.spacing(0.25),
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.16em',
  lineHeight: 1,
  textTransform: 'uppercase',
  color: theme.palette.auteura.copperLight,
}));

export const SignalDot = styled(Box)(({ theme }) => ({
  width: 10,
  height: 10,
  borderRadius: '50%',
  backgroundColor: theme.palette.auteura.copper,
  boxShadow: `0 0 0 6px rgba(192,110,40,0.14)`,
}));
