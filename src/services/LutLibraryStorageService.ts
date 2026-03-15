import {
  deleteDB,
  openDB,
  type DBSchema,
  type IDBPDatabase,
} from 'idb';
import {
  parseImportedLutRecord,
  toPersistedImportedLutRecord,
  type PersistedImportedLutRecord,
} from './storageSchemas';
import {
  assertStorageWriteCompatible,
  markCurrentClientWrite,
} from './AppCompatibilityService';

export interface ImportedLutRecord {
  readonly createdAt: number;
  readonly description?: string;
  readonly fileName: string;
  readonly id: string;
  readonly label: string;
  readonly notes?: string;
  readonly sourceText: string;
}

interface LutLibraryDatabaseSchema extends DBSchema {
  luts: {
    indexes: {
      createdAt: number;
    };
    key: string;
    value: PersistedImportedLutRecord;
  };
}

const databaseName = 'AuteuraLutLibraryDB';
const databaseVersion = 1;
const lutsStoreName = 'luts';

let databasePromise: Promise<IDBPDatabase<LutLibraryDatabaseSchema>> | null = null;

function getDatabase(): Promise<IDBPDatabase<LutLibraryDatabaseSchema>> {
  if (databasePromise === null) {
    databasePromise = openDB<LutLibraryDatabaseSchema>(databaseName, databaseVersion, {
      blocking(): void {
        databasePromise = null;
      },
      terminated(): void {
        databasePromise = null;
      },
      upgrade(database, _oldVersion, _newVersion, transaction): void {
        if (!database.objectStoreNames.contains(lutsStoreName)) {
          const store = database.createObjectStore(lutsStoreName, {
            keyPath: 'id',
          });
          store.createIndex('createdAt', 'createdAt');
          return;
        }

        const store = transaction.objectStore(lutsStoreName);

        if (!store.indexNames.contains('createdAt')) {
          store.createIndex('createdAt', 'createdAt');
        }
      },
    }).catch((error: unknown): never => {
      databasePromise = null;
      throw error instanceof Error
        ? error
        : new Error('Failed to initialize the LUT library database.');
    });
  }

  return databasePromise;
}

export async function listImportedLutRecords(): Promise<readonly ImportedLutRecord[]> {
  const database = await getDatabase();
  const importedRecords = await database.getAll(lutsStoreName);

  return importedRecords
    .map((record: PersistedImportedLutRecord): ImportedLutRecord | null => {
      try {
        return parseImportedLutRecord(record);
      } catch {
        return null;
      }
    })
    .filter(
      (record: ImportedLutRecord | null): record is ImportedLutRecord => record !== null,
    )
    .sort(
    (left: ImportedLutRecord, right: ImportedLutRecord): number =>
      right.createdAt - left.createdAt,
  );
}

export async function getImportedLutRecord(lutId: string): Promise<ImportedLutRecord | null> {
  const database = await getDatabase();
  const record = await database.get(lutsStoreName, lutId);

  if (record === undefined) {
    return null;
  }

  return parseImportedLutRecord(record);
}

export async function saveImportedLutRecord(record: ImportedLutRecord): Promise<void> {
  assertStorageWriteCompatible();
  const database = await getDatabase();
  await database.put(lutsStoreName, toPersistedImportedLutRecord(record));
  markCurrentClientWrite();
}

export async function deleteImportedLutRecord(lutId: string): Promise<void> {
  assertStorageWriteCompatible();
  const database = await getDatabase();
  await database.delete(lutsStoreName, lutId);
  markCurrentClientWrite();
}

export async function resetLutLibraryDatabase(): Promise<void> {
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
