import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { BrandMark } from './branding/BrandMark';

interface StudioEmptyStateProps {
  readonly body: string;
  readonly title: string;
}

export function StudioEmptyState({
  body,
  title,
}: StudioEmptyStateProps): JSX.Element {
  return (
    <Box
      sx={{
        px: 2,
        py: 2.5,
        borderRadius: 4,
        border: '1px dashed rgba(15, 79, 99, 0.18)',
        background:
          'linear-gradient(180deg, rgba(255,250,244,0.88) 0%, rgba(238,246,246,0.7) 100%)',
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
            backgroundColor: alpha('#0e5970', 0.08),
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
