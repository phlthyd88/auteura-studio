import {
  deleteDB,
  openDB,
  type DBSchema,
  type IDBPDatabase,
} from 'idb';
import {
  type TimelineProject,
  type TimelineProjectRecord,
} from '../models/Timeline';
import {
  parseTimelineProjectRecord,
  toPersistedTimelineProjectRecord,
  type PersistedTimelineProjectRecord,
} from './storageSchemas';
import {
  assertStorageWriteCompatible,
  markCurrentClientWrite,
} from './AppCompatibilityService';

interface TimelineProjectDatabaseSchema extends DBSchema {
  projects: {
    indexes: {
      updatedAt: number;
    };
    key: string;
    value: PersistedTimelineProjectRecord;
  };
}

const databaseName = 'AuteuraTimelineDB';
const databaseVersion = 1;
const projectsStoreName = 'projects';

let databasePromise: Promise<IDBPDatabase<TimelineProjectDatabaseSchema>> | null = null;

function getProjectDatabase(): Promise<IDBPDatabase<TimelineProjectDatabaseSchema>> {
  if (databasePromise === null) {
    databasePromise = openDB<TimelineProjectDatabaseSchema>(databaseName, databaseVersion, {
      blocking(): void {
        databasePromise = null;
      },
      terminated(): void {
        databasePromise = null;
      },
      upgrade(
        database,
        _oldVersion,
        _newVersion,
        transaction,
      ): void {
        if (!database.objectStoreNames.contains(projectsStoreName)) {
          const store = database.createObjectStore(projectsStoreName, {
            keyPath: 'id',
          });
          store.createIndex('updatedAt', 'updatedAt');
          return;
        }

        const store = transaction.objectStore(projectsStoreName);

        if (!store.indexNames.contains('updatedAt')) {
          store.createIndex('updatedAt', 'updatedAt');
        }
      },
    }).catch((error: unknown): never => {
      databasePromise = null;
      throw error instanceof Error
        ? error
        : new Error('Failed to initialize the timeline project database.');
    });
  }

  return databasePromise;
}

export async function saveProject(project: TimelineProjectRecord['project']): Promise<void> {
  assertStorageWriteCompatible();
  const database = await getProjectDatabase();
  await database.put(projectsStoreName, toPersistedTimelineProjectRecord(project));
  markCurrentClientWrite();
}

export async function getProject(projectId: string): Promise<TimelineProject | null> {
  const database = await getProjectDatabase();
  const record = await database.get(projectsStoreName, projectId);

  if (record === undefined) {
    return null;
  }

  return parseTimelineProjectRecord(record).project;
}

export async function getLatestProject(): Promise<TimelineProject | null> {
  const database = await getProjectDatabase();
  const transaction = database.transaction(projectsStoreName, 'readonly');
  const index = transaction.store.index('updatedAt');
  const records = await index.getAll();
  await transaction.done;

  const parsedRecords = records
    .map((record: PersistedTimelineProjectRecord): TimelineProjectRecord | null => {
      try {
        return parseTimelineProjectRecord(record);
      } catch {
        return null;
      }
    })
    .filter(
      (record: TimelineProjectRecord | null): record is TimelineProjectRecord => record !== null,
    );

  if (parsedRecords.length === 0) {
    return null;
  }

  const latestRecord = parsedRecords.sort(
    (left: TimelineProjectRecord, right: TimelineProjectRecord): number =>
      right.updatedAt - left.updatedAt,
  )[0];

  return latestRecord?.project ?? null;
}

export async function listProjects(): Promise<readonly TimelineProjectRecord[]> {
  const database = await getProjectDatabase();
  const records = await database.getAll(projectsStoreName);

  return records
    .map((record: PersistedTimelineProjectRecord): TimelineProjectRecord | null => {
      try {
        return parseTimelineProjectRecord(record);
      } catch {
        return null;
      }
    })
    .filter(
      (record: TimelineProjectRecord | null): record is TimelineProjectRecord => record !== null,
    )
    .sort(
    (left: TimelineProjectRecord, right: TimelineProjectRecord): number =>
      right.updatedAt - left.updatedAt,
  );
}

export async function deleteProject(projectId: string): Promise<void> {
  assertStorageWriteCompatible();
  const database = await getProjectDatabase();
  await database.delete(projectsStoreName, projectId);
  markCurrentClientWrite();
}

export async function resetProjectDatabase(): Promise<void> {
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
