import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEmptyTimelineProject } from '../../models/Timeline';
import {
  deleteProject,
  getLatestProject,
  getProject,
  listProjects,
  resetProjectDatabase,
  saveProject,
} from '../ProjectStorageService';

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
      },
      {
        id: firstProject.id,
      },
    ]);
  });
});
