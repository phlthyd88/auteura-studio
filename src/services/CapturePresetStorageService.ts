import {
  deleteDB,
  openDB,
  type DBSchema,
  type IDBPDatabase,
} from 'idb';
import type { CapturePresetRecord } from '../types/capturePreset';
import {
  parseCapturePresetRecord,
  toPersistedCapturePresetRecord,
  type PersistedCapturePresetRecord,
} from './storageSchemas';
import {
  assertStorageWriteCompatible,
  markCurrentClientWrite,
} from './AppCompatibilityService';

interface CapturePresetDatabaseSchema extends DBSchema {
  presets: {
    indexes: {
      updatedAt: number;
    };
    key: string;
    value: PersistedCapturePresetRecord;
  };
}

const databaseName = 'AuteuraCapturePresetDB';
const databaseVersion = 1;
const presetsStoreName = 'presets';

let databasePromise: Promise<IDBPDatabase<CapturePresetDatabaseSchema>> | null = null;

function getDatabase(): Promise<IDBPDatabase<CapturePresetDatabaseSchema>> {
  if (databasePromise === null) {
    databasePromise = openDB<CapturePresetDatabaseSchema>(databaseName, databaseVersion, {
      blocking(): void {
        databasePromise = null;
      },
      terminated(): void {
        databasePromise = null;
      },
      upgrade(database, _oldVersion, _newVersion, transaction): void {
        if (!database.objectStoreNames.contains(presetsStoreName)) {
          const store = database.createObjectStore(presetsStoreName, {
            keyPath: 'id',
          });
          store.createIndex('updatedAt', 'updatedAt');
          return;
        }

        const store = transaction.objectStore(presetsStoreName);

        if (!store.indexNames.contains('updatedAt')) {
          store.createIndex('updatedAt', 'updatedAt');
        }
      },
    }).catch((error: unknown): never => {
      databasePromise = null;
      throw error instanceof Error
        ? error
        : new Error('Failed to initialize the capture preset database.');
    });
  }

  return databasePromise;
}

export async function listCapturePresets(): Promise<readonly CapturePresetRecord[]> {
  const database = await getDatabase();
  const records = await database.getAll(presetsStoreName);

  return records
    .map((record: PersistedCapturePresetRecord): CapturePresetRecord | null => {
      try {
        return parseCapturePresetRecord(record);
      } catch {
        return null;
      }
    })
    .filter(
      (record: CapturePresetRecord | null): record is CapturePresetRecord => record !== null,
    )
    .sort(
    (left: CapturePresetRecord, right: CapturePresetRecord): number =>
      right.updatedAt - left.updatedAt,
  );
}

export async function saveCapturePreset(record: CapturePresetRecord): Promise<void> {
  assertStorageWriteCompatible();
  const database = await getDatabase();
  await database.put(presetsStoreName, toPersistedCapturePresetRecord(record));
  markCurrentClientWrite();
}

export async function deleteCapturePreset(presetId: string): Promise<void> {
  assertStorageWriteCompatible();
  const database = await getDatabase();
  await database.delete(presetsStoreName, presetId);
  markCurrentClientWrite();
}

export async function resetCapturePresetDatabase(): Promise<void> {
  const currentDatabasePromise = databasePromise;
  databasePromise = null;

  if (currentDatabasePromise !== null) {
    try {
      const database = await currentDatabasePromise;
      database.close();
    } catch {
      // Ignore failed initialization and continue with deletion by database name.
    }
  }

  await deleteDB(databaseName);
}
