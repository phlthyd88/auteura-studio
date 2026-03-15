import {
  composeTimelineInstructions,
  type TimelineCompositionSnapshot,
  type TimelineCompositionOptions,
} from './TimelineCompositionEngine';
import type { TimelineProject } from '../models/Timeline';

export type TimelineCompositionFrame = TimelineCompositionSnapshot;

export function composeTimelineFrame(
  project: TimelineProject,
  playheadMs: number,
  options: TimelineCompositionOptions = {
    exportMode: false,
    isPlaying: false,
    qualityScale: 1,
  },
): TimelineCompositionSnapshot {
  return composeTimelineInstructions(project, playheadMs, null, options);
}
