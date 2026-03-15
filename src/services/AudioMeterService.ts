export interface AudioMeterChannelSnapshot {
  readonly peak: number;
  readonly peakDbfs: number | null;
  readonly rms: number;
  readonly rmsDbfs: number | null;
}

export interface AudioMeterSnapshot {
  readonly active: boolean;
  readonly channelCount: number;
  readonly channels: readonly AudioMeterChannelSnapshot[];
  readonly peak: number;
  readonly peakDbfs: number | null;
  readonly rms: number;
  readonly rmsDbfs: number | null;
}

export interface AudioMeterCollectionSnapshot {
  readonly liveInput: AudioMeterSnapshot;
  readonly timelinePlayback: AudioMeterSnapshot;
}

const analyserFftSize = 2048;
const defaultSilentSnapshot: AudioMeterSnapshot = {
  active: false,
  channelCount: 2,
  channels: [
    {
      peak: 0,
      peakDbfs: null,
      rms: 0,
      rmsDbfs: null,
    },
    {
      peak: 0,
      peakDbfs: null,
      rms: 0,
      rmsDbfs: null,
    },
  ],
  peak: 0,
  peakDbfs: null,
  rms: 0,
  rmsDbfs: null,
};

function toDbfs(amplitude: number): number | null {
  if (!Number.isFinite(amplitude) || amplitude <= 0) {
    return null;
  }

  return 20 * Math.log10(amplitude);
}

function createSilentSnapshot(channelCount: number): AudioMeterSnapshot {
  if (channelCount === defaultSilentSnapshot.channelCount) {
    return defaultSilentSnapshot;
  }

  return {
    active: false,
    channelCount,
    channels: Array.from({ length: channelCount }, (): AudioMeterChannelSnapshot => ({
      peak: 0,
      peakDbfs: null,
      rms: 0,
      rmsDbfs: null,
    })),
    peak: 0,
    peakDbfs: null,
    rms: 0,
    rmsDbfs: null,
  };
}

class AudioMeterTap {
  private readonly analysers: readonly AnalyserNode[];

  private readonly channelBuffers: readonly Float32Array<ArrayBuffer>[];

  private readonly splitterNode: ChannelSplitterNode;

  public readonly inputNode: GainNode;

  public constructor(
    private readonly audioContext: AudioContext,
    private readonly channelCount: number = 2,
  ) {
    this.inputNode = audioContext.createGain();
    this.inputNode.channelCountMode = 'explicit';
    this.inputNode.channelInterpretation = 'speakers';
    this.splitterNode = audioContext.createChannelSplitter(channelCount);
    this.analysers = Array.from({ length: channelCount }, (): AnalyserNode => {
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = analyserFftSize;
      analyser.minDecibels = -96;
      analyser.maxDecibels = -6;
      analyser.smoothingTimeConstant = 0.72;
      return analyser;
    });
    this.channelBuffers = this.analysers.map(
      (analyser: AnalyserNode): Float32Array<ArrayBuffer> => new Float32Array(analyser.fftSize),
    );

    this.inputNode.connect(this.splitterNode);
    this.analysers.forEach((analyser: AnalyserNode, channelIndex: number): void => {
      this.splitterNode.connect(analyser, channelIndex);
    });
  }

  public connectOutput(outputNode: AudioNode): void {
    this.inputNode.connect(outputNode);
  }

  public createSnapshot(): AudioMeterSnapshot {
    if (this.audioContext.state === 'closed') {
      return createSilentSnapshot(this.channelCount);
    }

    const channels = this.analysers.map(
      (analyser: AnalyserNode, index: number): AudioMeterChannelSnapshot => {
        const buffer =
          this.channelBuffers[index] ??
          new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(buffer);

        let peak = 0;
        let squareSum = 0;

        buffer.forEach((sample: number): void => {
          const amplitude = Math.abs(sample);
          peak = Math.max(peak, amplitude);
          squareSum += sample * sample;
        });

        const rms = Math.sqrt(squareSum / buffer.length);

        return {
          peak,
          peakDbfs: toDbfs(peak),
          rms,
          rmsDbfs: toDbfs(rms),
        };
      },
    );

    const peak = Math.max(...channels.map((channel): number => channel.peak));
    const rms = Math.max(...channels.map((channel): number => channel.rms));

    return {
      active: peak > 0.001 || rms > 0.0005,
      channelCount: this.channelCount,
      channels,
      peak,
      peakDbfs: toDbfs(peak),
      rms,
      rmsDbfs: toDbfs(rms),
    };
  }

  public dispose(): void {
    this.inputNode.disconnect();
    this.splitterNode.disconnect();
    this.analysers.forEach((analyser: AnalyserNode): void => {
      analyser.disconnect();
    });
  }
}

export class AudioMeterService {
  private readonly liveInputTap: AudioMeterTap;

  private readonly timelinePlaybackTap: AudioMeterTap;

  private liveInputSourceNode: MediaStreamAudioSourceNode | null = null;

  private liveInputStreamId: string | null = null;

  public readonly timelineOutputNode: GainNode;

  public constructor(private readonly audioContext: AudioContext, recordDestinationNode: AudioNode) {
    this.liveInputTap = new AudioMeterTap(audioContext);
    this.timelinePlaybackTap = new AudioMeterTap(audioContext);
    this.timelineOutputNode = audioContext.createGain();
    this.timelineOutputNode.channelCountMode = 'max';

    this.timelineOutputNode.connect(this.timelinePlaybackTap.inputNode);
    this.timelinePlaybackTap.connectOutput(audioContext.destination);
    this.timelinePlaybackTap.connectOutput(recordDestinationNode);
    this.liveInputTap.connectOutput(recordDestinationNode);
  }

  public setLiveInputStream(stream: MediaStream | null): void {
    const nextStreamId = stream?.id ?? null;

    if (nextStreamId !== null && nextStreamId === this.liveInputStreamId) {
      return;
    }

    this.detachLiveInputStream();

    if (stream === null || stream.getAudioTracks().length === 0) {
      return;
    }

    this.liveInputSourceNode = this.audioContext.createMediaStreamSource(stream);
    this.liveInputSourceNode.connect(this.liveInputTap.inputNode);
    this.liveInputStreamId = stream.id;
  }

  public createSnapshot(): AudioMeterCollectionSnapshot {
    return {
      liveInput: this.liveInputTap.createSnapshot(),
      timelinePlayback: this.timelinePlaybackTap.createSnapshot(),
    };
  }

  public dispose(): void {
    this.detachLiveInputStream();
    this.timelineOutputNode.disconnect();
    this.liveInputTap.dispose();
    this.timelinePlaybackTap.dispose();
  }

  private detachLiveInputStream(): void {
    if (this.liveInputSourceNode !== null) {
      this.liveInputSourceNode.disconnect();
      this.liveInputSourceNode = null;
    }

    this.liveInputStreamId = null;
  }
}
