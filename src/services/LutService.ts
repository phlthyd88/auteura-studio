import lutCatalog from '../config/luts.json';
import type { LoadedLut, LutDefinition } from '../types/color';
import {
  deleteImportedLutRecord,
  getImportedLutRecord,
  listImportedLutRecords,
  resetLutLibraryDatabase as resetLutLibraryStorage,
  saveImportedLutRecord,
  type ImportedLutRecord,
} from './LutLibraryStorageService';

interface ParsedCubeHeader {
  readonly domainMax: readonly [number, number, number];
  readonly domainMin: readonly [number, number, number];
  readonly size: number;
}

const importedPrefix = 'imported:';
const lutLoadCache = new Map<string, Promise<LoadedLut>>();
const lutCacheUsageOrder: string[] = [];
const maxImportedLutBytes = 512 * 1024;
const maxImportedLutCount = 24;
const maxParsedLutCacheEntries = 8;
const bundledLutDefinitions = validateCatalogEntries(
  (lutCatalog as readonly Omit<LutDefinition, 'sourceType'>[]).map(
    (entry: Omit<LutDefinition, 'sourceType'>): LutDefinition => ({
      ...entry,
      sourceType: 'bundled',
    }),
  ),
);

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function touchCachedLut(lutId: string): void {
  const existingIndex = lutCacheUsageOrder.indexOf(lutId);

  if (existingIndex !== -1) {
    lutCacheUsageOrder.splice(existingIndex, 1);
  }

  lutCacheUsageOrder.push(lutId);
}

function evictParsedLutCacheIfNeeded(): void {
  while (lutCacheUsageOrder.length > maxParsedLutCacheEntries) {
    const oldestLutId = lutCacheUsageOrder.shift();

    if (oldestLutId !== undefined) {
      lutLoadCache.delete(oldestLutId);
    }
  }
}

function ensureFiniteNumber(rawValue: string, context: string): number {
  const nextValue = Number(rawValue);

  if (!Number.isFinite(nextValue)) {
    throw new Error(`Invalid numeric value "${rawValue}" while parsing ${context}.`);
  }

  return nextValue;
}

function parseHeaderLine(line: string, header: ParsedCubeHeader): ParsedCubeHeader {
  const [keyword, ...rawValues] = line.split(/\s+/u);

  if (keyword === 'LUT_3D_SIZE') {
    const size = ensureFiniteNumber(rawValues[0] ?? '', 'LUT_3D_SIZE');

    if (!Number.isInteger(size) || size < 2) {
      throw new Error('LUT_3D_SIZE must be an integer greater than 1.');
    }

    return {
      ...header,
      size,
    };
  }

  if (keyword === 'DOMAIN_MIN' || keyword === 'DOMAIN_MAX') {
    if (rawValues.length !== 3) {
      throw new Error(`${keyword} must contain exactly three numeric values.`);
    }

    const parsedValues: [number, number, number] = [
      ensureFiniteNumber(rawValues[0] ?? '', keyword),
      ensureFiniteNumber(rawValues[1] ?? '', keyword),
      ensureFiniteNumber(rawValues[2] ?? '', keyword),
    ];

    if (keyword === 'DOMAIN_MIN') {
      return {
        ...header,
        domainMin: parsedValues,
      };
    }

    return {
      ...header,
      domainMax: parsedValues,
    };
  }

  return header;
}

function normalizeColorValue(
  value: number,
  domainMin: number,
  domainMax: number,
): number {
  const domainRange = domainMax - domainMin;

  if (domainRange === 0) {
    throw new Error('LUT domain range cannot be zero.');
  }

  return clamp01((value - domainMin) / domainRange);
}

function parseCubeFile(source: string, definition: LutDefinition): LoadedLut {
  const lines = source.split(/\r?\n/u);
  let header: ParsedCubeHeader = {
    domainMax: [1, 1, 1],
    domainMin: [0, 0, 0],
    size: 0,
  };
  const colorEntries: Array<readonly [number, number, number]> = [];

  lines.forEach((line: string): void => {
    const trimmedLine = line.trim();

    if (trimmedLine === '' || trimmedLine.startsWith('#') || trimmedLine.startsWith('TITLE')) {
      return;
    }

    const isHeaderLine =
      trimmedLine.startsWith('LUT_3D_SIZE') ||
      trimmedLine.startsWith('DOMAIN_MIN') ||
      trimmedLine.startsWith('DOMAIN_MAX');

    if (isHeaderLine) {
      header = parseHeaderLine(trimmedLine, header);
      return;
    }

    const rawValues = trimmedLine.split(/\s+/u);

    if (rawValues.length !== 3) {
      throw new Error(`Invalid LUT row "${trimmedLine}" in ${definition.label}.`);
    }

    colorEntries.push([
      ensureFiniteNumber(rawValues[0] ?? '', definition.label),
      ensureFiniteNumber(rawValues[1] ?? '', definition.label),
      ensureFiniteNumber(rawValues[2] ?? '', definition.label),
    ]);
  });

  if (header.size === 0) {
    throw new Error(`Missing LUT_3D_SIZE in ${definition.label}.`);
  }

  const expectedEntryCount = header.size * header.size * header.size;

  if (colorEntries.length !== expectedEntryCount) {
    throw new Error(
      `LUT ${definition.label} expected ${expectedEntryCount} color rows but found ${colorEntries.length}.`,
    );
  }

  const textureWidth = header.size * header.size;
  const textureHeight = header.size;
  const textureData = new Uint8Array(textureWidth * textureHeight * 4);

  colorEntries.forEach((colorEntry, index): void => {
    const z = Math.floor(index / (header.size * header.size));
    const y = Math.floor(index / header.size) % header.size;
    const x = index % header.size;
    const textureX = x + z * header.size;
    const textureOffset = (y * textureWidth + textureX) * 4;

    const normalizedRed = normalizeColorValue(
      colorEntry[0],
      header.domainMin[0],
      header.domainMax[0],
    );
    const normalizedGreen = normalizeColorValue(
      colorEntry[1],
      header.domainMin[1],
      header.domainMax[1],
    );
    const normalizedBlue = normalizeColorValue(
      colorEntry[2],
      header.domainMin[2],
      header.domainMax[2],
    );

    textureData[textureOffset] = Math.round(normalizedRed * 255);
    textureData[textureOffset + 1] = Math.round(normalizedGreen * 255);
    textureData[textureOffset + 2] = Math.round(normalizedBlue * 255);
    textureData[textureOffset + 3] = 255;
  });

  return {
    cacheKey: `${definition.id}:${header.size}`,
    id: definition.id,
    label: definition.label,
    size: header.size,
    textureData,
    textureHeight,
    textureWidth,
  };
}

function validateCatalogEntries(entries: readonly LutDefinition[]): readonly LutDefinition[] {
  const ids = new Set<string>();

  return entries.map((entry: LutDefinition): LutDefinition => {
    if (entry.id.trim() === '' || entry.label.trim() === '' || entry.path.trim() === '') {
      throw new Error('Each LUT definition must include a non-empty id, label, and path.');
    }

    if (ids.has(entry.id)) {
      throw new Error(`Duplicate LUT id detected: ${entry.id}`);
    }

    ids.add(entry.id);
    return entry;
  });
}

function buildImportedLutDefinition(record: ImportedLutRecord): LutDefinition {
  return {
    id: record.id,
    importedAt: record.createdAt,
    label: record.label,
    path: `${importedPrefix}${record.id}`,
    sourceType: 'imported',
    ...(record.description === undefined ? {} : { description: record.description }),
    ...(record.fileName === undefined ? {} : { fileName: record.fileName }),
    ...(record.notes === undefined ? {} : { notes: record.notes }),
  };
}

function slugifyLutName(fileName: string): string {
  return fileName
    .replace(/\.cube$/iu, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 48);
}

function createImportedLutId(fileName: string): string {
  const slug = slugifyLutName(fileName);
  const suffix =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${importedPrefix}${slug === '' ? 'custom-lut' : slug}-${suffix}`;
}

async function getImportedLutDefinitions(): Promise<readonly LutDefinition[]> {
  const importedRecords = await listImportedLutRecords();

  return importedRecords.map((record: ImportedLutRecord): LutDefinition =>
    buildImportedLutDefinition(record),
  );
}

export function getBundledLuts(): readonly LutDefinition[] {
  return bundledLutDefinitions;
}

export async function getAvailableLuts(): Promise<readonly LutDefinition[]> {
  const importedDefinitions = await getImportedLutDefinitions();
  return [...importedDefinitions, ...bundledLutDefinitions];
}

export async function importLutFile(file: File): Promise<LutDefinition> {
  if (!file.name.toLowerCase().endsWith('.cube')) {
    throw new Error('Only .cube LUT files can be imported.');
  }

  if (file.size > maxImportedLutBytes) {
    throw new Error('Imported LUTs must be smaller than 512 KB.');
  }

  const sourceText = await file.text();
  const importedDefinition: LutDefinition = {
    id: createImportedLutId(file.name),
    label: file.name.replace(/\.cube$/iu, '').trim() || 'Imported LUT',
    path: `${importedPrefix}${file.name}`,
    sourceType: 'imported',
    fileName: file.name,
  };

  parseCubeFile(sourceText, importedDefinition);

  const record: ImportedLutRecord = {
    createdAt: Date.now(),
    description: 'User imported LUT.',
    fileName: file.name,
    id: importedDefinition.id,
    label: importedDefinition.label,
    notes: `Imported from ${file.name}`,
    sourceText,
  };

  const existingImportedLuts = await listImportedLutRecords();

  if (existingImportedLuts.length >= maxImportedLutCount) {
    const recordsToRemove = existingImportedLuts.slice(maxImportedLutCount - 1);

    await Promise.all(
      recordsToRemove.map((existingRecord: ImportedLutRecord): Promise<void> =>
        deleteImportedLutRecord(existingRecord.id),
      ),
    );

    recordsToRemove.forEach((existingRecord: ImportedLutRecord): void => {
      clearLutCache(existingRecord.id);
    });
  }

  await saveImportedLutRecord(record);
  clearLutCache(importedDefinition.id);
  return buildImportedLutDefinition(record);
}

export async function deleteImportedLut(lutId: string): Promise<void> {
  if (!lutId.startsWith(importedPrefix)) {
    throw new Error('Bundled LUTs cannot be deleted.');
  }

  await deleteImportedLutRecord(lutId);
  clearLutCache(lutId);
}

export async function loadLutById(lutId: string): Promise<LoadedLut> {
  const existingLoad = lutLoadCache.get(lutId);

  if (existingLoad !== undefined) {
    touchCachedLut(lutId);
    return existingLoad;
  }

  const bundledDefinition = bundledLutDefinitions.find(
    (definition: LutDefinition): boolean => definition.id === lutId,
  );

  const nextLoad = (bundledDefinition !== undefined
    ? fetch(bundledDefinition.path, {
        cache: 'no-store',
        credentials: 'same-origin',
      })
        .then(async (response: Response): Promise<string> => {
          if (!response.ok) {
            throw new Error(`Failed to load LUT ${bundledDefinition.label}.`);
          }

          return response.text();
        })
        .then((source: string): LoadedLut => parseCubeFile(source, bundledDefinition))
    : getImportedLutRecord(lutId).then((record: ImportedLutRecord | null): LoadedLut => {
        if (record === null) {
          throw new Error(`Unknown LUT id "${lutId}".`);
        }

        return parseCubeFile(record.sourceText, buildImportedLutDefinition(record));
      }))
    .catch((error: unknown): never => {
      lutLoadCache.delete(lutId);
      throw error instanceof Error ? error : new Error('Failed to load the selected LUT.');
    });

  lutLoadCache.set(lutId, nextLoad);
  touchCachedLut(lutId);
  evictParsedLutCacheIfNeeded();
  return nextLoad;
}

export function clearLutCache(lutId?: string): void {
  if (lutId === undefined) {
    lutLoadCache.clear();
    lutCacheUsageOrder.length = 0;
    return;
  }

  lutLoadCache.delete(lutId);
  const existingIndex = lutCacheUsageOrder.indexOf(lutId);

  if (existingIndex !== -1) {
    lutCacheUsageOrder.splice(existingIndex, 1);
  }
}

export async function resetLutLibraryDatabase(): Promise<void> {
  clearLutCache();
  await resetLutLibraryStorage();
}
