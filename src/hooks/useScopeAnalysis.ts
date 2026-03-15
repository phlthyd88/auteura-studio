import { useEffect, useMemo, useState, type MutableRefObject } from 'react';
import {
  emptyScopeAnalysis,
  ScopeAnalyzer,
  type ScopeAnalysisData,
  type ScopeAnalysisSettings,
} from '../engine/ScopeAnalyzer';

export function useScopeAnalysis(
  canvasRef: MutableRefObject<HTMLCanvasElement | null>,
  settings: ScopeAnalysisSettings,
): ScopeAnalysisData {
  const [analysis, setAnalysis] = useState<ScopeAnalysisData>(emptyScopeAnalysis);
  const sampleHeight = useMemo<number>(
    (): number => settings.sampleHeight,
    [settings.sampleHeight],
  );

  useEffect((): (() => void) => {
    if (!settings.enabled || settings.sampleFps <= 0) {
      setAnalysis(emptyScopeAnalysis);
      return (): void => undefined;
    }

    let analyzer: ScopeAnalyzer;

    try {
      analyzer = new ScopeAnalyzer(settings.sampleWidth, sampleHeight);
    } catch {
      setAnalysis(emptyScopeAnalysis);
      return (): void => undefined;
    }

    let animationFrameId: number | null = null;
    let lastSampleTimestamp = 0;
    let isCancelled = false;

    function sampleFrame(timestampMs: number): void {
      if (isCancelled) {
        return;
      }

      animationFrameId = window.requestAnimationFrame(sampleFrame);

      if (timestampMs - lastSampleTimestamp < 1000 / settings.sampleFps) {
        return;
      }

      const sourceCanvas = canvasRef.current;

      if (sourceCanvas === null || sourceCanvas.width === 0 || sourceCanvas.height === 0) {
        return;
      }

      lastSampleTimestamp = timestampMs;
      setAnalysis(analyzer.analyzeCanvas(sourceCanvas));
    }

    animationFrameId = window.requestAnimationFrame(sampleFrame);

    return (): void => {
      isCancelled = true;

      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [canvasRef, sampleHeight, settings]);

  return analysis;
}
