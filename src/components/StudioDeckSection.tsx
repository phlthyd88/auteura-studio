import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { InstrumentPanel, SectionEyebrow } from '../theme/brandPrimitives';

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
    <InstrumentPanel
      sx={{
        p: 2,
        borderRadius: '24px',
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
                    color: isDark ? theme.palette.auteura.tealLight : 'primary.dark',
                    border: `1px solid ${theme.palette.auteura.borderSubtle}`,
                    background:
                      isDark
                        ? `linear-gradient(135deg, rgba(32,194,197,0.14) 0%, rgba(192,110,40,0.12) 100%)`
                        : `linear-gradient(135deg, rgba(32,194,197,0.16) 0%, rgba(192,110,40,0.14) 100%)`,
                  }}
              >
                {icon}
              </Box>
            ) : null}
            <Box>
              {kicker !== undefined ? (
                <SectionEyebrow>
                  {kicker}
                </SectionEyebrow>
              ) : null}
              <Typography variant="h6">{title}</Typography>
            </Box>
          </Stack>
          {actions}
        </Stack>
        {children}
      </Stack>
    </InstrumentPanel>
  );
}
