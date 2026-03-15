import type { CSSProperties } from 'react';

interface BrandLogoProps {
  readonly opacity?: number;
  readonly size?: number;
  readonly style?: CSSProperties;
}

export function BrandLogo({
  opacity = 1,
  size = 64,
  style,
}: BrandLogoProps): JSX.Element {
  return (
    <img
      alt="Auteura"
      src="/branding/auteura-main-logo.svg"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        display: 'block',
        objectFit: 'contain',
        opacity,
        userSelect: 'none',
        ...style,
      }}
    />
  );
}
