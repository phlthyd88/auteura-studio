import {
  createEmptyTimelineProject,
  defaultTimelineClipAudioSettings,
  defaultTimelineClipEffects,
  defaultTimelineClipTransform,
  defaultTimelineTrackState,
  type TimelineBlendMode,
  type TimelineClip,
  type TimelineClipAudioSettings,
  type TimelineClipEffect,
  type TimelineClipSource,
  type TimelineEnvelopePoint,
  type TimelineProject,
  type TimelineProjectListEntry,
  type TimelineProjectRecord,
  type TimelineTrack,
  type TimelineTransition,
} from '../models/Timeline';
import {
  defaultColorBalance,
  defaultColorGradingSettings,
  defaultTransformSettings,
  normalizeTransformSettings,
  type ColorGradingSettings,
  type RGBColorBalance,
  type TransformSettings,
} from '../types/color';
import { RenderMode } from '../types/render';
import type { CapturePresetRecord, CapturePresetSettings, StillImageFormat } from '../types/capturePreset';
import type { LookPresetRecord, LookPresetSettings } from '../types/lookPreset';
import type { ImportedLutRecord } from './LutLibraryStorageService';

export const storageSchemaVersion = 1;

export interface PersistedTimelineProjectRecord {
  readonly createdAt: number;
  readonly id: string;
  readonly project: TimelineProject;
  readonly schemaVersion: number;
  readonly updatedAt: number;
}

export interface PersistedTimelineProjectMetadataRecord {
  readonly createdAt: number;
  readonly id: string;
  readonly name: string;
  readonly schemaVersion: number;
  readonly updatedAt: number;
}

export interface PersistedLookPresetRecord extends LookPresetRecord {
  readonly schemaVersion: number;
}

export interface PersistedCapturePresetRecord extends CapturePresetRecord {
  readonly schemaVersion: number;
}

export interface PersistedImportedLutRecord extends ImportedLutRecord {
  readonly schemaVersion: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function asStringOrNull(value: unknown): string | null {
  return value === null ? null : asString(value);
}

function asReadonlyArray(value: unknown): readonly unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function parseRgbColorBalance(value: unknown, fallback: RGBColorBalance): RGBColorBalance {
  const record = asRecord(value);

  if (record === null) {
    return fallback;
  }

  return {
    blue: asNumber(record.blue) ?? fallback.blue,
    green: asNumber(record.green) ?? fallback.green,
    red: asNumber(record.red) ?? fallback.red,
  };
}

function parseColorGradingSettings(value: unknown): ColorGradingSettings {
  const record = asRecord(value);

  if (record === null) {
    return defaultColorGradingSettings;
  }

  return {
    bypass: asBoolean(record.bypass) ?? defaultColorGradingSettings.bypass,
    contrast: asNumber(record.contrast) ?? defaultColorGradingSettings.contrast,
    exposure: asNumber(record.exposure) ?? defaultColorGradingSettings.exposure,
    gain: parseRgbColorBalance(record.gain, defaultColorBalance),
    gamma: parseRgbColorBalance(record.gamma, defaultColorBalance),
    grain: asNumber(record.grain) ?? defaultColorGradingSettings.grain,
    lift: parseRgbColorBalance(record.lift, defaultColorGradingSettings.lift),
    lutIntensity: asNumber(record.lutIntensity) ?? defaultColorGradingSettings.lutIntensity,
    saturation: asNumber(record.saturation) ?? defaultColorGradingSettings.saturation,
    temperature: asNumber(record.temperature) ?? defaultColorGradingSettings.temperature,
    tint: asNumber(record.tint) ?? defaultColorGradingSettings.tint,
    vignette: asNumber(record.vignette) ?? defaultColorGradingSettings.vignette,
  };
}

function parseTransformSettings(value: unknown): TransformSettings {
  const record = asRecord(value);

  if (record === null) {
    return defaultTransformSettings;
  }

  return normalizeTransformSettings({
    flipX: asBoolean(record.flipX) ?? defaultTransformSettings.flipX,
    flipY: asBoolean(record.flipY) ?? defaultTransformSettings.flipY,
    panX: asNumber(record.panX) ?? defaultTransformSettings.panX,
    panY: asNumber(record.panY) ?? defaultTransformSettings.panY,
    rotationDeg: asNumber(record.rotationDeg) ?? defaultTransformSettings.rotationDeg,
    zoom: asNumber(record.zoom) ?? defaultTransformSettings.zoom,
  });
}

function parseTimelineEnvelopePoints(value: unknown): readonly TimelineEnvelopePoint[] {
  const points = asReadonlyArray(value);

  if (points === null) {
    return [];
  }

  return points
    .map((point: unknown): TimelineEnvelopePoint | null => {
      const record = asRecord(point);

      if (record === null) {
        return null;
      }

      const timeMs = asNumber(record.timeMs);
      const valueNumber = asNumber(record.value);

      if (timeMs === null || valueNumber === null) {
        return null;
      }

      return {
        timeMs,
        value: valueNumber,
      };
    })
    .filter((point: TimelineEnvelopePoint | null): point is TimelineEnvelopePoint => point !== null);
}

function parseTimelineClipAudioSettings(value: unknown): TimelineClipAudioSettings {
  const record = asRecord(value);

  if (record === null) {
    return defaultTimelineClipAudioSettings;
  }

  return {
    fadeInMs: asNumber(record.fadeInMs) ?? defaultTimelineClipAudioSettings.fadeInMs,
    fadeOutMs: asNumber(record.fadeOutMs) ?? defaultTimelineClipAudioSettings.fadeOutMs,
    gain: asNumber(record.gain) ?? defaultTimelineClipAudioSettings.gain,
    muted: asBoolean(record.muted) ?? defaultTimelineClipAudioSettings.muted,
    pan: asNumber(record.pan) ?? defaultTimelineClipAudioSettings.pan,
    panEnvelope: parseTimelineEnvelopePoints(record.panEnvelope),
    volumeEnvelope: parseTimelineEnvelopePoints(record.volumeEnvelope),
  };
}

function parseTimelineClipSource(value: unknown): TimelineClipSource | null {
  const record = asRecord(value);
  const audioMetadataRecord = record === null ? null : asRecord(record.audioMetadata);

  if (record === null || audioMetadataRecord === null) {
    return null;
  }

  const mediaId = asString(record.mediaId);
  const mediaType = asString(record.mediaType);
  const name = asString(record.name);
  const hasAudio = asBoolean(audioMetadataRecord.hasAudio);

  if (
    mediaId === null ||
    name === null ||
    hasAudio === null ||
    (mediaType !== 'image' && mediaType !== 'video')
  ) {
    return null;
  }

  return {
    audioMetadata: {
      hasAudio,
      ...(asNumber(audioMetadataRecord.channelCount) === null
        ? {}
        : { channelCount: asNumber(audioMetadataRecord.channelCount)! }),
      ...(asNumber(audioMetadataRecord.sampleRate) === null
        ? {}
        : { sampleRate: asNumber(audioMetadataRecord.sampleRate)! }),
    },
    mediaId,
    mediaType,
    name,
    ...(asString(record.thumbnail) === null ? {} : { thumbnail: asString(record.thumbnail)! }),
  };
}

function parseTimelineClipTransform(
  value: unknown,
): TimelineClip['transform'] {
  const record = asRecord(value);

  if (record === null) {
    return defaultTimelineClipTransform;
  }

  return {
    rotationDegrees:
      asNumber(record.rotationDegrees) ?? defaultTimelineClipTransform.rotationDegrees,
    scale: asNumber(record.scale) ?? defaultTimelineClipTransform.scale,
    x: asNumber(record.x) ?? defaultTimelineClipTransform.x,
    y: asNumber(record.y) ?? defaultTimelineClipTransform.y,
  };
}

function parseTimelineTransition(value: unknown): TimelineTransition | null {
  const record = asRecord(value);

  if (record === null) {
    return null;
  }

  const id = asString(record.id);
  const durationMs = asNumber(record.durationMs);
  const type = asString(record.type);
  const placement = asString(record.placement);
  const curve = asString(record.curve);

  if (
    id === null ||
    durationMs === null ||
    type === null ||
    placement === null ||
    curve === null
  ) {
    return null;
  }

  return {
    curve: ['ease-in', 'ease-in-out', 'ease-out', 'linear'].includes(curve)
      ? (curve as TimelineTransition['curve'])
      : 'linear',
    durationMs,
    id,
    placement: placement === 'in' || placement === 'out' ? placement : 'out',
    type: [
      'crossfade',
      'dip-to-black',
      'dip-to-white',
      'slide-left',
      'slide-right',
      'wipe-left-to-right',
      'wipe-right-to-left',
    ].includes(type)
      ? (type as TimelineTransition['type'])
      : 'crossfade',
  };
}

function parseTimelineClipEffects(value: unknown): readonly TimelineClipEffect[] {
  const effects = asReadonlyArray(value);

  if (effects === null) {
    return defaultTimelineClipEffects;
  }

  return effects
    .map((effect: unknown): TimelineClipEffect | null => {
      const record = asRecord(effect);

      if (record === null) {
        return null;
      }

      const id = asString(record.id);
      const label = asString(record.label);
      const type = asString(record.type);
      const enabled = asBoolean(record.enabled);

      if (id === null || label === null || type === null || enabled === null) {
        return null;
      }

      if (type === 'blur') {
        const radius = asNumber(record.radius);
        return radius === null ? null : { enabled, id, label, radius, type };
      }

      if (type === 'crop') {
        const top = asNumber(record.top);
        const right = asNumber(record.right);
        const bottom = asNumber(record.bottom);
        const left = asNumber(record.left);
        return top === null || right === null || bottom === null || left === null
          ? null
          : { bottom, enabled, id, label, left, right, top, type };
      }

      if (type === 'sharpen') {
        const amount = asNumber(record.amount);
        return amount === null ? null : { amount, enabled, id, label, type };
      }

      if (type === 'transform-override') {
        return {
          enabled,
          id,
          label,
          transform: parseTimelineClipTransform(record.transform),
          type,
        };
      }

      if (type === 'vignette') {
        const feather = asNumber(record.feather);
        const intensity = asNumber(record.intensity);
        const roundness = asNumber(record.roundness);
        return feather === null || intensity === null || roundness === null
          ? null
          : { enabled, feather, id, intensity, label, roundness, type };
      }

      return null;
    })
    .filter((effect: TimelineClipEffect | null): effect is TimelineClipEffect => effect !== null);
}

function parseTimelineClip(value: unknown): TimelineClip | null {
  const record = asRecord(value);

  if (record === null) {
    return null;
  }

  const id = asString(record.id);
  const label = asString(record.label);
  const startMs = asNumber(record.startMs);
  const durationMs = asNumber(record.durationMs);
  const trimStartMs = asNumber(record.trimStartMs);
  const trimEndMs = asNumber(record.trimEndMs);
  const opacity = asNumber(record.opacity);
  const source = parseTimelineClipSource(record.source);
  const blendModeValue = asString(record.blendMode);

  if (
    id === null ||
    label === null ||
    startMs === null ||
    durationMs === null ||
    trimStartMs === null ||
    trimEndMs === null ||
    opacity === null ||
    source === null
  ) {
    return null;
  }

  const blendMode: TimelineBlendMode = ['add', 'multiply', 'normal', 'overlay', 'screen'].includes(
    blendModeValue ?? '',
  )
    ? (blendModeValue as TimelineBlendMode)
    : 'normal';

  return {
    audio: parseTimelineClipAudioSettings(record.audio),
    blendMode,
    durationMs,
    effects: parseTimelineClipEffects(record.effects),
    id,
    label,
    opacity,
    source,
    startMs,
    transform: parseTimelineClipTransform(record.transform),
    transitions: (asReadonlyArray(record.transitions) ?? [])
      .map(parseTimelineTransition)
      .filter((transition: TimelineTransition | null): transition is TimelineTransition => transition !== null),
    trimEndMs,
    trimStartMs,
  };
}

function parseTimelineTrack(value: unknown): TimelineTrack | null {
  const record = asRecord(value);

  if (record === null) {
    return null;
  }

  const id = asString(record.id);
  const label = asString(record.label);
  const type = asString(record.type);
  const clipIds = asReadonlyArray(record.clipIds);

  if (
    id === null ||
    label === null ||
    clipIds === null ||
    (type !== 'audio' && type !== 'video')
  ) {
    return null;
  }

  return {
    clipIds: clipIds
      .map(asString)
      .filter((clipId: string | null): clipId is string => clipId !== null),
    id,
    label,
    locked: asBoolean(record.locked) ?? defaultTimelineTrackState.locked,
    muted: asBoolean(record.muted) ?? defaultTimelineTrackState.muted,
    solo: asBoolean(record.solo) ?? defaultTimelineTrackState.solo,
    type,
  };
}

function parseTimelineProject(value: unknown): TimelineProject {
  const record = asRecord(value);

  if (record === null) {
    throw new Error('Stored timeline project is not an object.');
  }

  const id = asString(record.id);
  const name = asString(record.name);
  const createdAt = asNumber(record.createdAt);
  const updatedAt = asNumber(record.updatedAt);

  if (id === null || name === null || createdAt === null || updatedAt === null) {
    throw new Error('Stored timeline project is missing required metadata.');
  }

  const emptyProject = createEmptyTimelineProject(name);
  const clipLookupRecord = asRecord(record.clipLookup) ?? {};
  const parsedClipLookup = Object.fromEntries(
    Object.entries(clipLookupRecord)
      .map(([clipId, clipValue]): readonly [string, TimelineClip] | null => {
        const parsedClip = parseTimelineClip(clipValue);
        return parsedClip === null ? null : [clipId, parsedClip];
      })
      .filter(
        (entry: readonly [string, TimelineClip] | null): entry is readonly [string, TimelineClip] =>
          entry !== null,
      ),
  ) as Record<string, TimelineClip>;
  const parsedTracks = (asReadonlyArray(record.tracks) ?? [])
    .map(parseTimelineTrack)
    .filter((track: TimelineTrack | null): track is TimelineTrack => track !== null)
    .map((track: TimelineTrack): TimelineTrack => ({
      ...track,
      clipIds: track.clipIds.filter((clipId: string): boolean => clipId in parsedClipLookup),
    }));

  return {
    clipLookup: parsedClipLookup,
    createdAt,
    durationMs: asNumber(record.durationMs) ?? emptyProject.durationMs,
    id,
    name,
    playheadMs: asNumber(record.playheadMs) ?? emptyProject.playheadMs,
    selectedClipId: asStringOrNull(record.selectedClipId),
    selectedTrackId: asStringOrNull(record.selectedTrackId),
    tracks: parsedTracks.length === 0 ? emptyProject.tracks : parsedTracks,
    updatedAt,
    zoomLevel: asNumber(record.zoomLevel) ?? emptyProject.zoomLevel,
  };
}

function parseLookPresetSettings(value: unknown): LookPresetSettings {
  const record = asRecord(value);

  if (record === null) {
    throw new Error('Look preset settings are invalid.');
  }

  const mode = asString(record.mode);

  return {
    activeLutId: asStringOrNull(record.activeLutId),
    colorGrading: parseColorGradingSettings(record.colorGrading),
    mode:
      mode === RenderMode.Inverted || mode === RenderMode.Monochrome || mode === RenderMode.Passthrough
        ? mode
        : RenderMode.Passthrough,
    transform: parseTransformSettings(record.transform),
  };
}

function parseCapturePresetSettings(value: unknown): CapturePresetSettings {
  const record = asRecord(value);

  if (record === null) {
    throw new Error('Capture preset settings are invalid.');
  }

  const stillImageFormat = asString(record.stillImageFormat);

  return {
    burstCount: asNumber(record.burstCount) ?? 3,
    countdownSeconds: asNumber(record.countdownSeconds) ?? 0,
    recordingProfileId: asString(record.recordingProfileId) ?? 'balanced',
    stillImageFormat:
      stillImageFormat === 'image/png' || stillImageFormat === 'image/webp'
        ? (stillImageFormat as StillImageFormat)
        : 'image/webp',
  };
}

function parseImportedLutRecordBody(value: unknown): ImportedLutRecord {
  const record = asRecord(value);

  if (record === null) {
    throw new Error('Imported LUT record is invalid.');
  }

  const id = asString(record.id);
  const label = asString(record.label);
  const fileName = asString(record.fileName);
  const sourceText = asString(record.sourceText);
  const createdAt = asNumber(record.createdAt);

  if (id === null || label === null || fileName === null || sourceText === null || createdAt === null) {
    throw new Error('Imported LUT record is missing required fields.');
  }

  return {
    createdAt,
    ...(asString(record.description) === null ? {} : { description: asString(record.description)! }),
    fileName,
    id,
    label,
    ...(asString(record.notes) === null ? {} : { notes: asString(record.notes)! }),
    sourceText,
  };
}

export function toPersistedTimelineProjectRecord(project: TimelineProject): PersistedTimelineProjectRecord {
  return {
    createdAt: project.createdAt,
    id: project.id,
    project,
    schemaVersion: storageSchemaVersion,
    updatedAt: project.updatedAt,
  };
}

export function parseTimelineProjectRecord(value: unknown): TimelineProjectRecord {
  const record = asRecord(value);

  if (record === null) {
    throw new Error('Stored timeline project record is invalid.');
  }

  if ('schemaVersion' in record) {
    const schemaVersion = asNumber(record.schemaVersion);

    if (schemaVersion === null || schemaVersion > storageSchemaVersion) {
      throw new Error('Stored timeline project schema is unsupported.');
    }
  }

  const id = asString(record.id);
  const createdAt = asNumber(record.createdAt);
  const updatedAt = asNumber(record.updatedAt);

  if (id === null || createdAt === null || updatedAt === null) {
    throw new Error('Stored timeline project record is missing required fields.');
  }

  return {
    createdAt,
    id,
    project: parseTimelineProject(record.project),
    updatedAt,
  };
}

export function toPersistedTimelineProjectMetadataRecord(
  project: TimelineProject,
): PersistedTimelineProjectMetadataRecord {
  return {
    createdAt: project.createdAt,
    id: project.id,
    name: project.name,
    schemaVersion: storageSchemaVersion,
    updatedAt: project.updatedAt,
  };
}

export function parseTimelineProjectMetadataRecord(value: unknown): TimelineProjectListEntry {
  const record = asRecord(value);

  if (record === null) {
    throw new Error('Stored timeline project metadata record is invalid.');
  }

  if ('schemaVersion' in record) {
    const schemaVersion = asNumber(record.schemaVersion);

    if (schemaVersion === null || schemaVersion > storageSchemaVersion) {
      throw new Error('Stored timeline project metadata schema is unsupported.');
    }
  }

  const id = asString(record.id);
  const name = asString(record.name);
  const createdAt = asNumber(record.createdAt);
  const updatedAt = asNumber(record.updatedAt);

  if (id === null || name === null || createdAt === null || updatedAt === null) {
    throw new Error('Stored timeline project metadata record is missing required fields.');
  }

  return {
    createdAt,
    id,
    name,
    updatedAt,
  };
}

export function toPersistedLookPresetRecord(record: LookPresetRecord): PersistedLookPresetRecord {
  return {
    ...record,
    schemaVersion: storageSchemaVersion,
  };
}

export function parseLookPresetRecord(value: unknown): LookPresetRecord {
  const record = asRecord(value);

  if (record === null) {
    throw new Error('Stored look preset is invalid.');
  }

  if ('schemaVersion' in record) {
    const schemaVersion = asNumber(record.schemaVersion);
    if (schemaVersion === null || schemaVersion > storageSchemaVersion) {
      throw new Error('Stored look preset schema is unsupported.');
    }
  }

  const id = asString(record.id);
  const name = asString(record.name);
  const createdAt = asNumber(record.createdAt);
  const updatedAt = asNumber(record.updatedAt);

  if (id === null || name === null || createdAt === null || updatedAt === null) {
    throw new Error('Stored look preset is missing required fields.');
  }

  return {
    createdAt,
    id,
    name,
    settings: parseLookPresetSettings(record.settings),
    updatedAt,
  };
}

export function toPersistedCapturePresetRecord(
  record: CapturePresetRecord,
): PersistedCapturePresetRecord {
  return {
    ...record,
    schemaVersion: storageSchemaVersion,
  };
}

export function parseCapturePresetRecord(value: unknown): CapturePresetRecord {
  const record = asRecord(value);

  if (record === null) {
    throw new Error('Stored capture preset is invalid.');
  }

  if ('schemaVersion' in record) {
    const schemaVersion = asNumber(record.schemaVersion);
    if (schemaVersion === null || schemaVersion > storageSchemaVersion) {
      throw new Error('Stored capture preset schema is unsupported.');
    }
  }

  const id = asString(record.id);
  const label = asString(record.label);
  const description = asString(record.description);
  const createdAt = asNumber(record.createdAt);
  const updatedAt = asNumber(record.updatedAt);
  const isBundled = asBoolean(record.isBundled);

  if (
    id === null ||
    label === null ||
    description === null ||
    createdAt === null ||
    updatedAt === null ||
    isBundled === null
  ) {
    throw new Error('Stored capture preset is missing required fields.');
  }

  return {
    createdAt,
    description,
    id,
    isBundled,
    label,
    settings: parseCapturePresetSettings(record.settings),
    updatedAt,
  };
}

export function toPersistedImportedLutRecord(
  record: ImportedLutRecord,
): PersistedImportedLutRecord {
  return {
    ...record,
    schemaVersion: storageSchemaVersion,
  };
}

export function parseImportedLutRecord(value: unknown): ImportedLutRecord {
  const record = asRecord(value);

  if (record === null) {
    throw new Error('Stored imported LUT is invalid.');
  }

  if ('schemaVersion' in record) {
    const schemaVersion = asNumber(record.schemaVersion);
    if (schemaVersion === null || schemaVersion > storageSchemaVersion) {
      throw new Error('Stored imported LUT schema is unsupported.');
    }
  }

  return parseImportedLutRecordBody(record);
}
