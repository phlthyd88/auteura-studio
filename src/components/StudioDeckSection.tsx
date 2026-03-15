import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import type { ReactNode } from 'react';

interface StudioDeckSectionProps {
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly icon?: ReactNode;
  readonly kicker?: string;
  readonly title: string;
}

export function StudioDeckSection({
  actions = null,
  children,
  icon = null,
  kicker,
  title,
}: StudioDeckSectionProps): JSX.Element {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      sx={{
        p: 2,
        borderRadius: '24px',
        border: `1px solid ${isDark ? 'rgba(120, 173, 191, 0.16)' : 'rgba(15, 79, 99, 0.08)'}`,
        bgcolor: alpha(theme.palette.background.paper, isDark ? 0.82 : 0.84),
        boxShadow: isDark
          ? '0 18px 40px rgba(0, 0, 0, 0.28)'
          : '0 18px 40px rgba(15, 79, 99, 0.08)',
      }}
    >
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1.5} justifyContent="space-between" alignItems="flex-start">
          <Stack direction="row" spacing={1.2} alignItems="center">
            {icon !== null ? (
                <Box
                  sx={{
                    width: 42,
                    height: 42,
                    flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                    borderRadius: '16px',
                  color: 'primary.dark',
                  border: `1px solid ${isDark ? 'rgba(120, 173, 191, 0.16)' : 'rgba(15, 79, 99, 0.08)'}`,
                  background:
                    isDark
                      ? 'linear-gradient(135deg, rgba(32,194,197,0.2) 0%, rgba(192,110,40,0.16) 100%)'
                      : 'linear-gradient(135deg, rgba(32,194,197,0.16) 0%, rgba(192,110,40,0.14) 100%)',
                }}
              >
                {icon}
              </Box>
            ) : null}
            <Box>
              {kicker !== undefined ? (
                <Typography
                  variant="overline"
                  sx={{
                    color: 'secondary.dark',
                    display: 'block',
                    mb: 0.2,
                  }}
                >
                  {kicker}
                </Typography>
              ) : null}
              <Typography variant="h6">{title}</Typography>
            </Box>
          </Stack>
          {actions}
        </Stack>
        {children}
      </Stack>
    </Box>
  );
}
