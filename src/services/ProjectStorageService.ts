import {
  deleteDB,
  openDB,
  type DBSchema,
  type IDBPDatabase,
} from 'idb';
import {
  type TimelineProject,
  type TimelineProjectListEntry,
} from '../models/Timeline';
import {
  parseTimelineProjectMetadataRecord,
  parseTimelineProjectRecord,
  toPersistedTimelineProjectMetadataRecord,
  toPersistedTimelineProjectRecord,
  type PersistedTimelineProjectMetadataRecord,
  type PersistedTimelineProjectRecord,
} from './storageSchemas';
import {
  assertStorageWriteCompatible,
  markCurrentClientWrite,
} from './AppCompatibilityService';

interface TimelineProjectDatabaseSchema extends DBSchema {
  projectMetadata: {
    indexes: {
      updatedAt: number;
    };
    key: string;
    value: PersistedTimelineProjectMetadataRecord;
  };
  projects: {
    indexes: {
      updatedAt: number;
    };
    key: string;
    value: PersistedTimelineProjectRecord;
  };
}

const databaseName = 'AuteuraTimelineDB';
const databaseVersion = 2;
const projectMetadataStoreName = 'projectMetadata';
const projectsStoreName = 'projects';

let databasePromise: Promise<IDBPDatabase<TimelineProjectDatabaseSchema>> | null = null;
let projectMetadataBackfillPromise: Promise<void> | null = null;

async function ensureProjectMetadataBackfill(
  database: IDBPDatabase<TimelineProjectDatabaseSchema>,
): Promise<void> {
  if (projectMetadataBackfillPromise !== null) {
    return projectMetadataBackfillPromise;
  }

  projectMetadataBackfillPromise = (async (): Promise<void> => {
    const existingMetadataCount = await database.count(projectMetadataStoreName);

    if (existingMetadataCount > 0) {
      return;
    }

    const projectRecords = await database.getAll(projectsStoreName);

    if (projectRecords.length === 0) {
      return;
    }

    const transaction = database.transaction(projectMetadataStoreName, 'readwrite');

    for (const record of projectRecords) {
      try {
        const parsedRecord = parseTimelineProjectRecord(record);
        await transaction.store.put(
          toPersistedTimelineProjectMetadataRecord(parsedRecord.project),
        );
      } catch {
        // Ignore malformed legacy records during metadata backfill.
      }
    }

    await transaction.done;
  })().finally((): void => {
    projectMetadataBackfillPromise = null;
  });

  return projectMetadataBackfillPromise;
}

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
        }

        const store = transaction.objectStore(projectsStoreName);

        if (!store.indexNames.contains('updatedAt')) {
          store.createIndex('updatedAt', 'updatedAt');
        }

        if (!database.objectStoreNames.contains(projectMetadataStoreName)) {
          const metadataStore = database.createObjectStore(projectMetadataStoreName, {
            keyPath: 'id',
          });
          metadataStore.createIndex('updatedAt', 'updatedAt');
        } else {
          const metadataStore = transaction.objectStore(projectMetadataStoreName);

          if (!metadataStore.indexNames.contains('updatedAt')) {
            metadataStore.createIndex('updatedAt', 'updatedAt');
          }
        }
      },
    }).catch((error: unknown): never => {
      databasePromise = null;
      throw error instanceof Error
        ? error
        : new Error('Failed to initialize the timeline project database.');
    }).then(async (database): Promise<IDBPDatabase<TimelineProjectDatabaseSchema>> => {
      await ensureProjectMetadataBackfill(database);
      return database;
    });
  }

  return databasePromise;
}

export async function saveProject(project: TimelineProject): Promise<void> {
  assertStorageWriteCompatible();
  const database = await getProjectDatabase();
  const transaction = database.transaction(
    [projectsStoreName, projectMetadataStoreName],
    'readwrite',
  );
  await transaction.objectStore(projectsStoreName).put(toPersistedTimelineProjectRecord(project));
  await transaction.objectStore(projectMetadataStoreName).put(
    toPersistedTimelineProjectMetadataRecord(project),
  );
  await transaction.done;
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
  const transaction = database.transaction(projectMetadataStoreName, 'readonly');
  const index = transaction.store.index('updatedAt');
  const metadataRecord = await index.openCursor(null, 'prev').then(
    (cursor): PersistedTimelineProjectMetadataRecord | undefined => cursor?.value,
  );
  await transaction.done;

  if (metadataRecord === undefined) {
    return null;
  }

  return getProject(metadataRecord.id);
}

export async function listProjects(): Promise<readonly TimelineProjectListEntry[]> {
  const database = await getProjectDatabase();
  const records = await database.getAll(projectMetadataStoreName);

  return records
    .map((record: PersistedTimelineProjectMetadataRecord): TimelineProjectListEntry | null => {
      try {
        return parseTimelineProjectMetadataRecord(record);
      } catch {
        return null;
      }
    })
    .filter(
      (record: TimelineProjectListEntry | null): record is TimelineProjectListEntry => record !== null,
    )
    .sort(
    (left: TimelineProjectListEntry, right: TimelineProjectListEntry): number =>
      right.updatedAt - left.updatedAt,
  );
}

export async function deleteProject(projectId: string): Promise<void> {
  assertStorageWriteCompatible();
  const database = await getProjectDatabase();
  const transaction = database.transaction(
    [projectsStoreName, projectMetadataStoreName],
    'readwrite',
  );
  await transaction.objectStore(projectsStoreName).delete(projectId);
  await transaction.objectStore(projectMetadataStoreName).delete(projectId);
  await transaction.done;
  markCurrentClientWrite();
}

export async function resetProjectDatabase(): Promise<void> {
  const currentDatabasePromise = databasePromise;
  databasePromise = null;
  projectMetadataBackfillPromise = null;

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
