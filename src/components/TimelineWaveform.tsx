import Box from '@mui/material/Box';
import { useEffect, useRef } from 'react';
import type { WaveformSummary } from '../services/WaveformAnalysisService';

interface TimelineWaveformProps {
  readonly color?: string;
  readonly loading?: boolean;
  readonly summary: WaveformSummary | null | undefined;
  readonly trimEndMs: number;
  readonly trimStartMs: number;
}

function resolveCanvasColor(
  canvas: HTMLCanvasElement,
  color: string,
): string {
  if (!color.startsWith('var(')) {
    return color;
  }

  const variableName = color.slice(4, -1).trim();
  const resolvedColor = window.getComputedStyle(canvas).getPropertyValue(variableName).trim();

  return resolvedColor.length > 0 ? resolvedColor : color;
}

function drawWaveform(
  canvas: HTMLCanvasElement,
  summary: WaveformSummary | null | undefined,
  trimStartMs: number,
  trimEndMs: number,
  color: string,
  loading: boolean,
): void {
  const context = canvas.getContext('2d');

  if (context === null) {
    return;
  }

  const width = canvas.width;
  const height = canvas.height;

  context.clearRect(0, 0, width, height);
  const resolvedColor = resolveCanvasColor(canvas, color);

  context.fillStyle = 'rgba(6,16,23,0.94)';
  context.fillRect(0, 0, width, height);

  context.strokeStyle = 'rgba(255,255,255,0.1)';
  context.lineWidth = 1;

  for (let x = 0; x <= width; x += 16 * (window.devicePixelRatio || 1)) {
    context.beginPath();
    context.moveTo(x + 0.5, 0);
    context.lineTo(x + 0.5, height);
    context.stroke();
  }

  for (let y = 0; y <= height; y += 8 * (window.devicePixelRatio || 1)) {
    context.beginPath();
    context.moveTo(0, y + 0.5);
    context.lineTo(width, y + 0.5);
    context.stroke();
  }

  const baselineY = height / 2;
  context.strokeStyle = 'rgba(255,255,255,0.1)';
  context.beginPath();
  context.moveTo(0, baselineY);
  context.lineTo(width, baselineY);
  context.stroke();

  if (loading) {
    context.strokeStyle = 'rgba(192,110,40,0.72)';
    context.beginPath();
    context.moveTo(0, baselineY);
    context.lineTo(width * 0.45, baselineY);
    context.stroke();
    return;
  }

  if (summary === null || summary === undefined || summary.peaks.length === 0) {
    return;
  }

  const durationMs = summary.durationSeconds * 1000;
  const clampedTrimStartMs = Math.max(0, Math.min(trimStartMs, durationMs));
  const clampedTrimEndMs = Math.max(
    clampedTrimStartMs + 1,
    Math.min(trimEndMs, durationMs > 0 ? durationMs : clampedTrimStartMs + 1),
  );
  const visibleDurationMs = Math.max(1, clampedTrimEndMs - clampedTrimStartMs);
  const bucketCount = summary.resolution;
  const verticalPadding = 4 * (window.devicePixelRatio || 1);
  const amplitude = (height - verticalPadding * 2) / 2;

  context.strokeStyle = resolvedColor;
  context.lineWidth = Math.max(1, window.devicePixelRatio || 1);

  context.shadowBlur = 8 * (window.devicePixelRatio || 1);
  context.shadowColor = resolvedColor;

  for (let x = 0; x < width; x += 1) {
    const columnStartRatio = x / width;
    const columnEndRatio = (x + 1) / width;
    const bucketStart = Math.max(
      0,
      Math.floor(((clampedTrimStartMs + visibleDurationMs * columnStartRatio) / durationMs) * bucketCount),
    );
    const bucketEnd = Math.min(
      bucketCount,
      Math.max(
        bucketStart + 1,
        Math.ceil(((clampedTrimStartMs + visibleDurationMs * columnEndRatio) / durationMs) * bucketCount),
      ),
    );
    let minimumSample = 1;
    let maximumSample = -1;

    for (let bucketIndex = bucketStart; bucketIndex < bucketEnd; bucketIndex += 1) {
      minimumSample = Math.min(minimumSample, summary.peaks[bucketIndex * 2] ?? 0);
      maximumSample = Math.max(maximumSample, summary.peaks[bucketIndex * 2 + 1] ?? 0);
    }

    const minY = baselineY - maximumSample * amplitude;
    const maxY = baselineY - minimumSample * amplitude;
    context.beginPath();
    context.moveTo(x + 0.5, minY);
    context.lineTo(x + 0.5, maxY);
    context.stroke();
  }

  context.shadowBlur = 0;
  context.shadowColor = 'transparent';
}

export function TimelineWaveform({
  color = 'var(--color-accent-copper)',
  loading = false,
  summary,
  trimEndMs,
  trimStartMs,
}: TimelineWaveformProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect((): (() => void) | void => {
    const canvas = canvasRef.current;

    if (canvas === null) {
      return undefined;
    }

    const redraw = (): void => {
      const nextWidth = Math.max(1, Math.floor(canvas.clientWidth * (window.devicePixelRatio || 1)));
      const nextHeight = Math.max(1, Math.floor(canvas.clientHeight * (window.devicePixelRatio || 1)));

      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
      }

      drawWaveform(canvas, summary, trimStartMs, trimEndMs, color, loading);
    };

    redraw();

    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const resizeObserver = new ResizeObserver((): void => {
      redraw();
    });

    resizeObserver.observe(canvas);

    return (): void => {
      resizeObserver.disconnect();
    };
  }, [color, loading, summary, trimEndMs, trimStartMs]);

  return (
    <Box
      component="canvas"
      ref={canvasRef}
      sx={{
        display: 'block',
        width: '100%',
        height: 32,
        borderRadius: 1.5,
        background:
          'linear-gradient(180deg, rgba(6,16,23,0.96), rgba(10,22,31,0.92)), repeating-linear-gradient(90deg, rgba(255,255,255,0.1) 0 1px, transparent 1px 16px)',
      }}
    />
  );
}
