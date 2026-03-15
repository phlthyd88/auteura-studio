import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDB, type DBSchema } from 'idb';
import { createEmptyTimelineProject } from '../../models/Timeline';
import {
  deleteProject,
  getLatestProject,
  getProject,
  listProjects,
  resetProjectDatabase,
  saveProject,
} from '../ProjectStorageService';
import { toPersistedTimelineProjectRecord } from '../storageSchemas';

interface LegacyTimelineProjectDatabaseSchema extends DBSchema {
  projects: {
    indexes: {
      updatedAt: number;
    };
    key: string;
    value: ReturnType<typeof toPersistedTimelineProjectRecord>;
  };
}

describe('ProjectStorageService', (): void => {
  const savedProjectIds: string[] = [];

  beforeEach(async (): Promise<void> => {
    savedProjectIds.length = 0;
    await resetProjectDatabase();
  });

  afterEach(async (): Promise<void> => {
    for (const projectId of savedProjectIds) {
      await deleteProject(projectId);
    }

    await resetProjectDatabase();
  });

  it('saves, retrieves, and lists projects by most recently updated', async (): Promise<void> => {
    const firstProject = {
      ...createEmptyTimelineProject('First'),
      id: 'project-one',
      updatedAt: 10,
    };
    const secondProject = {
      ...createEmptyTimelineProject('Second'),
      id: 'project-two',
      updatedAt: 20,
    };

    savedProjectIds.push(firstProject.id, secondProject.id);
    await saveProject(firstProject);
    await saveProject(secondProject);

    await expect(getProject(firstProject.id)).resolves.toMatchObject({
      id: firstProject.id,
      name: 'First',
    });
    await expect(getLatestProject()).resolves.toMatchObject({
      id: secondProject.id,
      name: 'Second',
    });
    await expect(listProjects()).resolves.toMatchObject([
      {
        id: secondProject.id,
        name: 'Second',
      },
      {
        id: firstProject.id,
        name: 'First',
      },
    ]);
  });

  it('backfills metadata from legacy projects-only storage', async (): Promise<void> => {
    const legacyFirstProject = {
      ...createEmptyTimelineProject('Legacy First'),
      id: 'legacy-project-one',
      updatedAt: 15,
    };
    const legacySecondProject = {
      ...createEmptyTimelineProject('Legacy Second'),
      id: 'legacy-project-two',
      updatedAt: 25,
    };

    const legacyDatabase = await openDB<LegacyTimelineProjectDatabaseSchema>(
      'AuteuraTimelineDB',
      1,
      {
        upgrade(database): void {
          const store = database.createObjectStore('projects', {
            keyPath: 'id',
          });
          store.createIndex('updatedAt', 'updatedAt');
        },
      },
    );
    const transaction = legacyDatabase.transaction('projects', 'readwrite');
    await transaction.store.put(toPersistedTimelineProjectRecord(legacyFirstProject));
    await transaction.store.put(toPersistedTimelineProjectRecord(legacySecondProject));
    await transaction.done;
    legacyDatabase.close();

    await expect(listProjects()).resolves.toMatchObject([
      {
        id: legacySecondProject.id,
        name: 'Legacy Second',
      },
      {
        id: legacyFirstProject.id,
        name: 'Legacy First',
      },
    ]);
    await expect(getLatestProject()).resolves.toMatchObject({
      id: legacySecondProject.id,
      name: 'Legacy Second',
    });
    await expect(getProject(legacyFirstProject.id)).resolves.toMatchObject({
      id: legacyFirstProject.id,
      name: 'Legacy First',
    });
  });
});
