# AUTEURA-115: Stop project listing from materializing full records

- Status: `done`
- Severity: `medium`
- Release Gate: `pre_scale`
- Owner: `unassigned`
- Created: `2026-03-15`
- Updated: `2026-03-15`
- Dependencies: `none`

## Summary

Project listing and latest-project lookup still materialize and sort full project records instead of using metadata-first queries.

## Problem

[ProjectStorageService.ts](../../src/services/ProjectStorageService.ts#L95) and [ProjectStorageService.ts](../../src/services/ProjectStorageService.ts#L126) fetch all projects to answer list/latest requests.

## Why It Matters

This will not scale once project payloads and history grow.

## Acceptance Criteria

- [x] project list and latest-project lookup avoid loading full project payloads where possible
- [x] query cost grows with metadata size, not project content size
- [x] current project save/load correctness remains intact

## Validation

- required automated checks:
  - metadata-first list/latest tests
- closure evidence:
  - `npm run typecheck`
  - `vitest run src/services/__tests__/ProjectStorageService.test.ts src/services/__tests__/storageSchemas.test.ts`

## Change Log

- `2026-03-15`: initial ticket created from release audit
- `2026-03-15`: split project metadata from full payload access, migrated legacy records through metadata backfill, and updated timeline project lists to consume lightweight entries
