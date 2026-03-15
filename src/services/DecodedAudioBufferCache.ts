export interface DecodedAudioBufferCache {
  clear(): void;
  get(mediaId: string): Promise<AudioBuffer | null> | undefined;
  set(mediaId: string, bufferPromise: Promise<AudioBuffer | null>): Promise<AudioBuffer | null>;
}

interface CacheEntry {
  bytes: number;
  promise: Promise<AudioBuffer | null>;
  settled: boolean;
}

function estimateAudioBufferBytes(buffer: AudioBuffer): number {
  return buffer.length * buffer.numberOfChannels * 4;
}

export class LruDecodedAudioBufferCache implements DecodedAudioBufferCache {
  private readonly entries = new Map<string, CacheEntry>();

  private totalBytes = 0;

  public constructor(private readonly maxBytes = 200 * 1024 * 1024) {}

  clear(): void {
    this.entries.clear();
    this.totalBytes = 0;
  }

  get(mediaId: string): Promise<AudioBuffer | null> | undefined {
    const existingEntry = this.entries.get(mediaId);

    if (existingEntry === undefined) {
      return undefined;
    }

    this.touch(mediaId, existingEntry);
    return existingEntry.promise;
  }

  set(mediaId: string, bufferPromise: Promise<AudioBuffer | null>): Promise<AudioBuffer | null> {
    const existingEntry = this.entries.get(mediaId);

    if (existingEntry !== undefined) {
      this.removeEntry(mediaId, existingEntry);
    }

    const nextEntry: CacheEntry = {
      bytes: 0,
      promise: Promise.resolve(null),
      settled: false,
    };

    const trackedPromise = bufferPromise
      .then((buffer): AudioBuffer | null => {
        if (buffer !== null) {
          nextEntry.bytes = estimateAudioBufferBytes(buffer);
          this.totalBytes += nextEntry.bytes;
        }

        nextEntry.settled = true;
        this.enforceLimit(mediaId);
        return buffer;
      })
      .catch((error: unknown): never => {
        this.removeEntry(mediaId, nextEntry);
        throw error;
      });

    nextEntry.promise = trackedPromise;
    this.entries.set(mediaId, nextEntry);
    return trackedPromise;
  }

  private touch(mediaId: string, entry: CacheEntry): void {
    this.entries.delete(mediaId);
    this.entries.set(mediaId, entry);
  }

  private removeEntry(mediaId: string, entry: CacheEntry): void {
    if (this.entries.delete(mediaId) && entry.bytes > 0) {
      this.totalBytes = Math.max(0, this.totalBytes - entry.bytes);
    }
  }

  private enforceLimit(protectedMediaId: string): void {
    if (this.totalBytes <= this.maxBytes) {
      return;
    }

    for (const [mediaId, entry] of this.entries) {
      if (this.totalBytes <= this.maxBytes) {
        break;
      }

      if (mediaId === protectedMediaId || entry.settled === false) {
        continue;
      }

      this.removeEntry(mediaId, entry);
    }
  }
}
