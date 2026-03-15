import { getMediaById } from './MediaStorageService';
import type { TimelineAudioCompositionInstruction, TimelineClipAudioSettings } from '../models/Timeline';

interface TimelineAudioEngineOptions {
  readonly audioContext: AudioContext;
  readonly decodedBufferCache?: Map<string, Promise<AudioBuffer | null>>;
  readonly outputNodes?: readonly AudioNode[];
}

interface ScheduledAudioNode {
  readonly endTimeSeconds: number;
  readonly gainNode: GainNode;
  readonly id: string;
  readonly sourceNode: AudioBufferSourceNode;
}

interface ScheduledClipAudioShape {
  readonly audio: TimelineClipAudioSettings;
  readonly durationMs: number;
}

function scheduleAutomationEnvelope(
  audioParam: AudioParam,
  baseValue: number,
  envelopePoints: readonly { readonly timeMs: number; readonly value: number }[],
  clipVisibleDurationMs: number,
  clipOffsetMs: number,
  scheduleStartSeconds: number,
): void {
  audioParam.cancelScheduledValues(scheduleStartSeconds);
  audioParam.setValueAtTime(baseValue, scheduleStartSeconds);

  envelopePoints.forEach((point): void => {
    if (point.timeMs < clipOffsetMs || point.timeMs > clipVisibleDurationMs) {
      return;
    }

    const pointTimeSeconds = scheduleStartSeconds + (point.timeMs - clipOffsetMs) / 1000;
    audioParam.linearRampToValueAtTime(point.value, pointTimeSeconds);
  });
}

function applyFadeAutomation(
  gainNode: GainNode,
  clip: ScheduledClipAudioShape,
  clipOffsetMs: number,
  scheduleStartSeconds: number,
  playbackDurationMs: number,
): void {
  const visibleDurationMs = clip.durationMs;
  const fadeInStartSeconds = scheduleStartSeconds;
  const fadeInEndSeconds =
    scheduleStartSeconds +
    Math.max(0, Math.min(clip.audio.fadeInMs, visibleDurationMs - clipOffsetMs)) / 1000;
  const clipEndSeconds = scheduleStartSeconds + playbackDurationMs / 1000;
  const fadeOutStartOffsetMs = Math.max(clipOffsetMs, visibleDurationMs - clip.audio.fadeOutMs);
  const fadeOutStartSeconds =
    scheduleStartSeconds + Math.max(0, fadeOutStartOffsetMs - clipOffsetMs) / 1000;

  gainNode.gain.cancelScheduledValues(scheduleStartSeconds);
  gainNode.gain.setValueAtTime(
    clip.audio.fadeInMs > clipOffsetMs ? 0 : clip.audio.gain,
    fadeInStartSeconds,
  );

  if (clip.audio.fadeInMs > clipOffsetMs && fadeInEndSeconds > fadeInStartSeconds) {
    gainNode.gain.linearRampToValueAtTime(clip.audio.gain, fadeInEndSeconds);
  }

  scheduleAutomationEnvelope(
    gainNode.gain,
    clip.audio.gain,
    clip.audio.volumeEnvelope,
    visibleDurationMs,
    clipOffsetMs,
    scheduleStartSeconds,
  );

  if (clip.audio.fadeOutMs > 0 && fadeOutStartSeconds < clipEndSeconds) {
    gainNode.gain.setValueAtTime(gainNode.gain.value, fadeOutStartSeconds);
    gainNode.gain.linearRampToValueAtTime(0, clipEndSeconds);
  }
}

export class TimelineAudioEngine {
  private readonly audioBufferCache: Map<string, Promise<AudioBuffer | null>>;

  private readonly outputNodes: readonly AudioNode[];

  private readonly scheduledNodes = new Map<string, ScheduledAudioNode>();

  public constructor(private readonly options: TimelineAudioEngineOptions) {
    this.audioBufferCache = options.decodedBufferCache ?? new Map();
    this.outputNodes =
      options.outputNodes === undefined || options.outputNodes.length === 0
        ? [options.audioContext.destination]
        : options.outputNodes;
  }

  async prefetchMediaIds(mediaIds: readonly string[]): Promise<void> {
    const uniqueMediaIds = new Set<string>(mediaIds);
    await Promise.all(
      [...uniqueMediaIds].map(async (mediaId: string): Promise<void> => {
        await this.getDecodedBuffer(mediaId);
      }),
    );
  }

  async prefetchInstructions(
    instructions: readonly TimelineAudioCompositionInstruction[],
  ): Promise<void> {
    await this.prefetchMediaIds(
      instructions.map(
        (instruction: TimelineAudioCompositionInstruction): string => instruction.mediaId,
      ),
    );
  }

  async scheduleInstructions(
    instructions: readonly TimelineAudioCompositionInstruction[],
  ): Promise<void> {
    this.stop();
    await this.prefetchInstructions(instructions);

    for (const instruction of instructions) {
      const buffer = await this.getDecodedBuffer(instruction.mediaId);

      if (buffer === null || instruction.startTimeSeconds === null) {
        continue;
      }

      const sourceOffsetSeconds = instruction.sourceOffsetMs / 1000;

      if (sourceOffsetSeconds >= buffer.duration) {
        continue;
      }

      const playbackDurationSeconds = Math.min(
        Math.max(0, instruction.durationMs / 1000),
        Math.max(0, buffer.duration - sourceOffsetSeconds),
      );

      if (playbackDurationSeconds <= 0) {
        continue;
      }

      const sourceNode = this.options.audioContext.createBufferSource();
      sourceNode.buffer = buffer;

      const gainNode = this.options.audioContext.createGain();
      const pannerNode =
        typeof this.options.audioContext.createStereoPanner === 'function'
          ? this.options.audioContext.createStereoPanner()
          : null;

      sourceNode.connect(gainNode);

      if (pannerNode !== null) {
        pannerNode.pan.cancelScheduledValues(instruction.startTimeSeconds);
        pannerNode.pan.setValueAtTime(instruction.pan, instruction.startTimeSeconds);
        scheduleAutomationEnvelope(
          pannerNode.pan,
          instruction.pan,
          instruction.panEnvelope,
          instruction.clipOffsetMs + instruction.durationMs,
          instruction.clipOffsetMs,
          instruction.startTimeSeconds,
        );
        gainNode.connect(pannerNode);
        this.outputNodes.forEach((outputNode: AudioNode): void => {
          pannerNode.connect(outputNode);
        });
      } else {
        this.outputNodes.forEach((outputNode: AudioNode): void => {
          gainNode.connect(outputNode);
        });
      }

      applyFadeAutomation(
        gainNode,
        {
          audio: {
            fadeInMs: instruction.fadeInMs,
            fadeOutMs: instruction.fadeOutMs,
            gain: instruction.gain,
            muted: false,
            pan: instruction.pan,
            panEnvelope: instruction.panEnvelope,
            volumeEnvelope: instruction.volumeEnvelope,
          },
          durationMs: instruction.clipOffsetMs + instruction.durationMs,
        },
        instruction.clipOffsetMs,
        instruction.startTimeSeconds,
        playbackDurationSeconds * 1000,
      );

      sourceNode.start(instruction.startTimeSeconds, sourceOffsetSeconds, playbackDurationSeconds);

      const scheduledNodeId = `${instruction.clipId}:${instruction.startTimeSeconds}`;
      this.scheduledNodes.set(scheduledNodeId, {
        endTimeSeconds: instruction.startTimeSeconds + playbackDurationSeconds,
        gainNode,
        id: scheduledNodeId,
        sourceNode,
      });

      sourceNode.onended = (): void => {
        this.disposeScheduledNode(scheduledNodeId);
      };
    }
  }

  stop(): void {
    this.scheduledNodes.forEach((scheduledNode: ScheduledAudioNode): void => {
      try {
        scheduledNode.sourceNode.stop();
      } catch {
        // Ignore nodes that have already completed or been stopped.
      }

      this.disposeScheduledNode(scheduledNode.id);
    });
    this.scheduledNodes.clear();
  }

  async getDecodedBuffer(mediaId: string): Promise<AudioBuffer | null> {
    const cachedBufferPromise = this.audioBufferCache.get(mediaId);

    if (cachedBufferPromise !== undefined) {
      return cachedBufferPromise;
    }

    const decodedBufferPromise = (async (): Promise<AudioBuffer | null> => {
      const mediaItem = await getMediaById(mediaId);

      if (mediaItem === null) {
        return null;
      }

      const arrayBuffer = await mediaItem.blob.arrayBuffer();

      try {
        return await this.options.audioContext.decodeAudioData(arrayBuffer.slice(0));
      } catch {
        return null;
      }
    })();

    this.audioBufferCache.set(mediaId, decodedBufferPromise);
    return decodedBufferPromise;
  }

  clearCache(): void {
    this.audioBufferCache.clear();
  }

  private disposeScheduledNode(scheduledNodeId: string): void {
    const scheduledNode = this.scheduledNodes.get(scheduledNodeId);

    if (scheduledNode === undefined) {
      return;
    }

    scheduledNode.sourceNode.disconnect();
    scheduledNode.gainNode.disconnect();
    this.scheduledNodes.delete(scheduledNodeId);
  }
}
