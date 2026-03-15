import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import { BrandMark } from './branding/BrandMark';

interface StudioEmptyStateProps {
  readonly body: string;
  readonly title: string;
}

export function StudioEmptyState({
  body,
  title,
}: StudioEmptyStateProps): JSX.Element {
  const theme = useTheme();

  return (
    <Box
      sx={{
        px: 2,
        py: 2.5,
        borderRadius: 4,
        border: `1px dashed ${alpha(theme.palette.auteura.borderSubtle, 0.96)}`,
        background: `linear-gradient(180deg, ${alpha(theme.palette.auteura.surfaceElevated, 0.88)} 0%, ${alpha(
          theme.palette.auteura.surface,
          0.82,
        )} 100%)`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
      }}
    >
      <Stack spacing={1.2} alignItems="flex-start">
        <Box
          sx={{
            width: 52,
            height: 52,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 3,
            backgroundColor: alpha(theme.palette.auteura.surfaceElevated, 0.78),
            border: `1px solid ${alpha(theme.palette.auteura.borderSubtle, 0.96)}`,
          }}
        >
          <BrandMark size={32} />
        </Box>
        <Box>
          <Typography variant="subtitle1">{title}</Typography>
          <Typography variant="body2" color="text.secondary">
            {body}
          </Typography>
        </Box>
      </Stack>
    </Box>
  );
}
