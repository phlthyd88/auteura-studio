import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import { useId } from 'react';

interface BrandMarkProps {
  readonly showWordmark?: boolean;
  readonly size?: number;
}

export function BrandMark({
  showWordmark = false,
  size = 64,
}: BrandMarkProps): JSX.Element {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const tealGradientId = useId();
  const copperGradientId = useId();

  if (showWordmark) {
    return (
      <Box
        component="svg"
        viewBox="0 0 200 280"
        sx={{
          width: size,
          height: size * 1.4,
          display: 'block',
        }}
      >
        <defs>
          <linearGradient id={tealGradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4DDBD4" />
            <stop offset="30%" stopColor="#2B9994" />
            <stop offset="100%" stopColor="#152929" />
          </linearGradient>

          <linearGradient id={copperGradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#E8AA85" />
            <stop offset="50%" stopColor="#C5815A" />
            <stop offset="100%" stopColor="#8A5A3F" />
          </linearGradient>
        </defs>

        <path
          fill={`url(#${tealGradientId})`}
          d="
            M 80,115.8
            A 50,50 0 1,1 120,115.8
            L 120,140
            L 135,145
            L 120,150
            L 120,160
            L 130,165
            L 120,170
            L 120,180
            L 135,185
            L 120,190
            L 120,200
            A 8,8 0 0,1 112,208
            L 88,208
            A 8,8 0 0,1 80,200
            Z
          "
        />

        <g
          fill="none"
          stroke={`url(#${copperGradientId})`}
          strokeLinecap="round"
          strokeWidth="3"
        >
          <path d="M 84,196 L 84,70 A 16,16 0 0,1 116,70 L 116,196" />
          <path d="M 90,196 L 90,70 A 10,10 0 0,1 110,70 L 110,196" />
          <path d="M 96,196 L 96,70 A 4,4 0 0,1 104,70 L 104,196" />
        </g>

        <text
          x="100"
          y="255"
          textAnchor="middle"
          fontFamily='"Avenir Next", "Trebuchet MS", "Segoe UI", sans-serif'
          fontSize="26"
          fontWeight="800"
          letterSpacing="0.15em"
          fill={isDark ? '#d8eceb' : '#1A5E5B'}
        >
          AUTEURA
        </text>
      </Box>
    );
  }

  return (
    <Box
      component="svg"
      viewBox="0 0 200 240"
      sx={{
        width: size,
        height: size * 1.2,
        display: 'block',
        opacity: isDark ? 0.92 : 0.88,
      }}
    >
      <path
        fill={isDark ? 'rgba(232, 244, 245, 0.9)' : 'rgba(255, 255, 255, 0.85)'}
        d="
          M 80,115.8 A 50,50 0 1,1 120,115.8
          L 120,140 L 135,145 L 120,150
          L 120,160 L 130,165 L 120,170
          L 120,180 L 135,185 L 120,190
          L 120,200 A 8,8 0 0,1 112,208
          L 88,208 A 8,8 0 0,1 80,200 Z
        "
      />

      <g
        fill="none"
        stroke={isDark ? 'rgba(4, 17, 25, 0.62)' : 'rgba(0, 0, 0, 0.4)'}
        strokeLinecap="round"
        strokeWidth="3"
      >
        <path d="M 84,196 L 84,70 A 16,16 0 0,1 116,70 L 116,196" />
        <path d="M 90,196 L 90,70 A 10,10 0 0,1 110,70 L 110,196" />
        <path d="M 96,196 L 96,70 A 4,4 0 0,1 104,70 L 104,196" />
      </g>
    </Box>
  );
}
