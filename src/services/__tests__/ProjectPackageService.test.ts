import { describe, expect, it } from 'vitest';
import { createEmptyTimelineProject } from '../../models/Timeline';
import {
  getOfflinePackagingAuditSnapshot,
  importProjectPackage,
} from '../ProjectPackageService';

describe('ProjectPackageService offline audit', (): void => {
  it('reports the manifest package path as fully bundled and offline-safe', (): void => {
    const auditSnapshot = getOfflinePackagingAuditSnapshot();

    expect(auditSnapshot.dependencyMode).toBe('fully-bundled');
    expect(auditSnapshot.dynamicImportCount).toBe(0);
    expect(auditSnapshot.networkDependencyCount).toBe(0);
    expect(auditSnapshot.packageExportOfflineSafe).toBe(true);
    expect(auditSnapshot.packageImportOfflineSafe).toBe(true);
    expect(auditSnapshot.requiresPrecachedAssets).toBe(false);
  });

  it('imports a valid manifest package and remaps the project identity', async (): Promise<void> => {
    const project = createEmptyTimelineProject('Package Test');
    const file = new File(
      [
        JSON.stringify({
          assetPayloadPolicy: 'external-references-only',
          createdAt: 100,
          packageFormatVersion: 1,
          packageId: 'pkg-1',
          packageMode: 'manifest-only',
          packagingStrategy: 'in-memory-small-package',
          project,
          referencedMedia: [],
        }),
      ],
      'project.auteura-project.json',
      { type: 'application/json' },
    );

    const result = await importProjectPackage(file);

    expect(result.referencedMediaCount).toBe(0);
    expect(result.importedProject.name).toBe('Package Test (Imported)');
    expect(result.importedProject.id).not.toBe(project.id);
  });

  it('rejects malformed package json', async (): Promise<void> => {
    const file = new File(['{"packageFormatVersion":'], 'broken.auteura-project.json', {
      type: 'application/json',
    });

    await expect(importProjectPackage(file)).rejects.toThrow();
  });

  it('rejects incomplete or unsupported project packages', async (): Promise<void> => {
    const incompleteFile = new File(
      [
        JSON.stringify({
          packageFormatVersion: 1,
          packageMode: 'manifest-only',
          referencedMedia: [],
        }),
      ],
      'incomplete.auteura-project.json',
      { type: 'application/json' },
    );
    const unsupportedFile = new File(
      [
        JSON.stringify({
          assetPayloadPolicy: 'external-references-only',
          createdAt: 100,
          packageFormatVersion: 2,
          packageId: 'pkg-2',
          packageMode: 'manifest-only',
          packagingStrategy: 'in-memory-small-package',
          project: createEmptyTimelineProject('Unsupported'),
          referencedMedia: [],
        }),
      ],
      'unsupported.auteura-project.json',
      { type: 'application/json' },
    );

    await expect(importProjectPackage(incompleteFile)).rejects.toThrow(
      'Project package is incomplete.',
    );
    await expect(importProjectPackage(unsupportedFile)).rejects.toThrow(
      'Unsupported project package format.',
    );
  });
});
