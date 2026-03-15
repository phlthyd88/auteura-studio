import { describe, expect, it } from 'vitest';
import {
  createEmptyTimelineProject,
  defaultTimelineClipAudioSettings,
  defaultTimelineClipEffects,
  defaultTimelineClipTransform,
  type TimelineProject,
} from '../../models/Timeline';
import {
  composeTimelinePlaybackAudioInstructions,
  composeTimelineInstructions,
} from '../TimelineCompositionEngine';
import { composeTimelineFrame } from '../TimelineCompositor';
import { getTopTimelineCompositionLayer } from '../../types/compositor';

describe('TimelineCompositor', (): void => {
  it('resolves active video and audio layers at a playhead', (): void => {
    const project: TimelineProject = {
      ...createEmptyTimelineProject(),
      clipLookup: {
        'video-a': {
          durationMs: 4_000,
          id: 'video-a',
          label: 'Video A',
          audio: defaultTimelineClipAudioSettings,
          blendMode: 'normal',
          effects: [
            {
              amount: 0.35,
              enabled: true,
              id: 'sharpen-a',
              label: 'Sharpen',
              type: 'sharpen',
            },
          ],
          opacity: 1,
          source: {
            audioMetadata: {
              hasAudio: true,
            },
            mediaId: 'media-video-a',
            mediaType: 'video',
            name: 'video-a.webm',
          },
          startMs: 1_000,
          transform: defaultTimelineClipTransform,
          transitions: [],
          trimEndMs: 4_000,
          trimStartMs: 0,
        },
        'audio-a': {
          durationMs: 3_000,
          id: 'audio-a',
          label: 'Audio A',
          audio: defaultTimelineClipAudioSettings,
          blendMode: 'normal',
          effects: defaultTimelineClipEffects,
          opacity: 1,
          source: {
            audioMetadata: {
              hasAudio: true,
            },
            mediaId: 'media-audio-a',
            mediaType: 'video',
            name: 'audio-a.webm',
          },
          startMs: 2_000,
          transform: defaultTimelineClipTransform,
          transitions: [],
          trimEndMs: 3_000,
          trimStartMs: 0,
        },
      },
      tracks: [
        {
          clipIds: ['video-a'],
          id: 'video-track-1',
          label: 'Video Track 1',
          locked: false,
          muted: false,
          solo: false,
          type: 'video',
        },
        {
          clipIds: ['audio-a'],
          id: 'audio-track-1',
          label: 'Audio Track 1',
          locked: false,
          muted: false,
          solo: false,
          type: 'audio',
        },
      ],
    };

    const compositionFrame = composeTimelineFrame(project, 2_500);
    const primaryLayer = getTopTimelineCompositionLayer(compositionFrame);

    expect(primaryLayer?.clipId).toBe('video-a');
    expect(primaryLayer?.clipOffsetMs).toBe(1_500);
    expect(primaryLayer?.effects[0]?.type).toBe('sharpen');
    expect(compositionFrame.layers).toHaveLength(1);
    expect(compositionFrame.audioNodes).toHaveLength(1);
    expect(compositionFrame.audioNodes[0]?.trackType).toBe('audio');
  });

  it('returns no primary video layer when the playhead is outside clip ranges', (): void => {
    const project: TimelineProject = {
      ...createEmptyTimelineProject(),
      clipLookup: {
        'video-a': {
          durationMs: 2_000,
          id: 'video-a',
          label: 'Video A',
          audio: defaultTimelineClipAudioSettings,
          blendMode: 'normal',
          effects: defaultTimelineClipEffects,
          opacity: 1,
          source: {
            audioMetadata: {
              hasAudio: true,
            },
            mediaId: 'media-video-a',
            mediaType: 'video',
            name: 'video-a.webm',
          },
          startMs: 1_000,
          transform: defaultTimelineClipTransform,
          transitions: [],
          trimEndMs: 2_000,
          trimStartMs: 0,
        },
      },
      tracks: [
        {
          clipIds: ['video-a'],
          id: 'video-track-1',
          label: 'Video Track 1',
          locked: false,
          muted: false,
          solo: false,
          type: 'video',
        },
      ],
    };

    const compositionFrame = composeTimelineFrame(project, 5_000);

    expect(getTopTimelineCompositionLayer(compositionFrame)).toBeNull();
    expect(compositionFrame.layers).toHaveLength(0);
    expect(compositionFrame.audioNodes).toHaveLength(0);
  });

  it('derives future playback audio instructions from the same timeline model', (): void => {
    const project: TimelineProject = {
      ...createEmptyTimelineProject(),
      clipLookup: {
        'audio-a': {
          durationMs: 3_000,
          id: 'audio-a',
          label: 'Audio A',
          audio: {
            ...defaultTimelineClipAudioSettings,
            fadeInMs: 250,
            fadeOutMs: 400,
            gain: 0.8,
          },
          blendMode: 'normal',
          effects: defaultTimelineClipEffects,
          opacity: 1,
          source: {
            audioMetadata: {
              hasAudio: true,
            },
            mediaId: 'media-audio-a',
            mediaType: 'video',
            name: 'audio-a.webm',
          },
          startMs: 1_000,
          transform: defaultTimelineClipTransform,
          transitions: [],
          trimEndMs: 3_000,
          trimStartMs: 0,
        },
      },
      tracks: [
        {
          clipIds: ['audio-a'],
          id: 'audio-track-1',
          label: 'Audio Track 1',
          locked: false,
          muted: false,
          solo: false,
          type: 'audio',
        },
      ],
    };

    const playbackInstructions = composeTimelinePlaybackAudioInstructions(project, 1_500, 10);

    expect(playbackInstructions).toHaveLength(1);
    expect(playbackInstructions[0]?.clipOffsetMs).toBe(500);
    expect(playbackInstructions[0]?.durationMs).toBe(2_500);
    expect(playbackInstructions[0]?.startTimeSeconds).toBe(10);
    expect(playbackInstructions[0]?.gain).toBe(0.8);
  });

  it('excludes muted tracks and honors soloed tracks in composition', (): void => {
    const project: TimelineProject = {
      ...createEmptyTimelineProject(),
      clipLookup: {
        'video-a': {
          durationMs: 2_000,
          id: 'video-a',
          label: 'Video A',
          audio: defaultTimelineClipAudioSettings,
          blendMode: 'normal',
          effects: defaultTimelineClipEffects,
          opacity: 1,
          source: {
            audioMetadata: {
              hasAudio: false,
            },
            mediaId: 'media-video-a',
            mediaType: 'video',
            name: 'video-a.webm',
          },
          startMs: 0,
          transform: defaultTimelineClipTransform,
          transitions: [],
          trimEndMs: 2_000,
          trimStartMs: 0,
        },
        'audio-a': {
          durationMs: 2_000,
          id: 'audio-a',
          label: 'Audio A',
          audio: defaultTimelineClipAudioSettings,
          blendMode: 'normal',
          effects: defaultTimelineClipEffects,
          opacity: 1,
          source: {
            audioMetadata: {
              hasAudio: true,
            },
            mediaId: 'media-audio-a',
            mediaType: 'video',
            name: 'audio-a.webm',
          },
          startMs: 0,
          transform: defaultTimelineClipTransform,
          transitions: [],
          trimEndMs: 2_000,
          trimStartMs: 0,
        },
      },
      tracks: [
        {
          clipIds: ['video-a'],
          id: 'video-track-1',
          label: 'Video Track 1',
          locked: false,
          muted: false,
          solo: true,
          type: 'video',
        },
        {
          clipIds: ['audio-a'],
          id: 'audio-track-1',
          label: 'Audio Track 1',
          locked: false,
          muted: true,
          solo: false,
          type: 'audio',
        },
      ],
    };

    const compositionFrame = composeTimelineFrame(project, 500);

    expect(compositionFrame.layers).toHaveLength(1);
    expect(compositionFrame.audioNodes).toHaveLength(0);
  });

  it('applies transition curves and preserves expanded transition types', (): void => {
    const project: TimelineProject = {
      ...createEmptyTimelineProject(),
      clipLookup: {
        'clip-a': {
          audio: defaultTimelineClipAudioSettings,
          blendMode: 'normal',
          durationMs: 2_000,
          effects: defaultTimelineClipEffects,
          id: 'clip-a',
          label: 'Clip A',
          opacity: 1,
          source: {
            audioMetadata: {
              hasAudio: false,
            },
            mediaId: 'media-a',
            mediaType: 'video',
            name: 'clip-a.webm',
          },
          startMs: 0,
          transform: defaultTimelineClipTransform,
          transitions: [
            {
              curve: 'ease-in',
              durationMs: 1_000,
              id: 'transition-a',
              placement: 'out',
              type: 'slide-left',
            },
          ],
          trimEndMs: 2_000,
          trimStartMs: 0,
        },
        'clip-b': {
          audio: defaultTimelineClipAudioSettings,
          blendMode: 'normal',
          durationMs: 1_500,
          effects: defaultTimelineClipEffects,
          id: 'clip-b',
          label: 'Clip B',
          opacity: 1,
          source: {
            audioMetadata: {
              hasAudio: false,
            },
            mediaId: 'media-b',
            mediaType: 'video',
            name: 'clip-b.webm',
          },
          startMs: 2_000,
          transform: defaultTimelineClipTransform,
          transitions: [],
          trimEndMs: 1_500,
          trimStartMs: 250,
        },
      },
      tracks: [
        {
          clipIds: ['clip-a', 'clip-b'],
          id: 'video-track-1',
          label: 'Video Track 1',
          locked: false,
          muted: false,
          solo: false,
          type: 'video',
        },
      ],
    };

    const compositionFrame = composeTimelineInstructions(project, 1_500, null, {
      exportMode: false,
      isPlaying: true,
      qualityScale: 1,
    });

    expect(compositionFrame.transitions).toHaveLength(1);
    expect(compositionFrame.transitions[0]?.type).toBe('slide-left');
    expect(compositionFrame.transitions[0]?.sourceA).toBe('media-a');
    expect(compositionFrame.transitions[0]?.sourceB).toBe('media-b');
    expect(compositionFrame.transitions[0]?.progress).toBeCloseTo(0.25, 5);
    expect(compositionFrame.transitions[0]?.sourceAOffsetMs).toBe(1_500);
    expect(compositionFrame.transitions[0]?.sourceBOffsetMs).toBe(0);
  });
});
