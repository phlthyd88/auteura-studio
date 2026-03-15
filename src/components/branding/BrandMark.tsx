import Box from '@mui/material/Box';

interface BrandMarkProps {
  readonly showWordmark?: boolean;
  readonly size?: number;
}

export function BrandMark({
  showWordmark = false,
  size = 64,
}: BrandMarkProps): JSX.Element {
  return (
    <Box
      component="img"
      alt={showWordmark ? 'Auteura logo' : 'Auteura mark'}
      src="/branding/auteura-main-logo.svg"
      sx={{
        width: size,
        height: size,
        display: 'block',
        objectFit: 'contain',
        userSelect: 'none',
      }}
    />
  );
}
