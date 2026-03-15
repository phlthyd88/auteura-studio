import {
  deleteDB,
  openDB,
  type DBSchema,
  type IDBPDatabase,
} from 'idb';
import type { LookPresetRecord } from '../types/lookPreset';
import {
  parseLookPresetRecord,
  toPersistedLookPresetRecord,
  type PersistedLookPresetRecord,
} from './storageSchemas';
import {
  assertStorageWriteCompatible,
  markCurrentClientWrite,
} from './AppCompatibilityService';

interface LookPresetDatabaseSchema extends DBSchema {
  presets: {
    indexes: {
      updatedAt: number;
    };
    key: string;
    value: PersistedLookPresetRecord;
  };
}

const databaseName = 'AuteuraLookPresetDB';
const databaseVersion = 1;
const presetsStoreName = 'presets';

let databasePromise: Promise<IDBPDatabase<LookPresetDatabaseSchema>> | null = null;

function getDatabase(): Promise<IDBPDatabase<LookPresetDatabaseSchema>> {
  if (databasePromise === null) {
    databasePromise = openDB<LookPresetDatabaseSchema>(databaseName, databaseVersion, {
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
        : new Error('Failed to initialize the look preset database.');
    });
  }

  return databasePromise;
}

export async function listLookPresets(): Promise<readonly LookPresetRecord[]> {
  const database = await getDatabase();
  const records = await database.getAll(presetsStoreName);

  return records
    .map((record: PersistedLookPresetRecord): LookPresetRecord | null => {
      try {
        return parseLookPresetRecord(record);
      } catch {
        return null;
      }
    })
    .filter((record: LookPresetRecord | null): record is LookPresetRecord => record !== null)
    .sort(
    (left: LookPresetRecord, right: LookPresetRecord): number =>
      right.updatedAt - left.updatedAt,
  );
}

export async function saveLookPreset(record: LookPresetRecord): Promise<void> {
  assertStorageWriteCompatible();
  const database = await getDatabase();
  await database.put(presetsStoreName, toPersistedLookPresetRecord(record));
  markCurrentClientWrite();
}

export async function deleteLookPreset(presetId: string): Promise<void> {
  assertStorageWriteCompatible();
  const database = await getDatabase();
  await database.delete(presetsStoreName, presetId);
  markCurrentClientWrite();
}

export async function resetLookPresetDatabase(): Promise<void> {
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
