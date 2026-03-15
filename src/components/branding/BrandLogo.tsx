import type { CSSProperties } from 'react';

interface BrandLogoProps {
  readonly maxHeight?: number;
  readonly opacity?: number;
  readonly size?: number;
  readonly style?: CSSProperties;
}

export function BrandLogo({
  maxHeight,
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
        height: 'auto',
        maxHeight: maxHeight === undefined ? `${size}px` : `${maxHeight}px`,
        display: 'block',
        objectFit: 'contain',
        opacity,
        userSelect: 'none',
        ...style,
      }}
    />
  );
}
