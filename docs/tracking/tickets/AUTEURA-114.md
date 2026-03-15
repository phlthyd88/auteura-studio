# AUTEURA-114: Represent unavailable linked media truthfully

- Status: `done`
- Severity: `medium`
- Release Gate: `pre_scale`
- Owner: `unassigned`
- Created: `2026-03-15`
- Updated: `2026-03-15`
- Dependencies: `none`

## Summary

Unavailable linked media is currently modeled as a normal media item with an empty placeholder blob.

## Problem

[MediaStorageService.ts](../../src/services/MediaStorageService.ts#L649) fabricates a zero-byte blob when a file-backed item is unavailable.

## Why It Matters

The type claims the item is usable media when runtime truth is “metadata only and unavailable”.

## Acceptance Criteria

- [x] unavailable linked media has an explicit runtime type or status
- [x] UI can distinguish unavailable media from valid empty files
- [x] preview/export flows fail fast with a useful recovery path

## Validation

- required automated checks:
  - unavailable linked media behavior test
- closure evidence:
  - `npm run typecheck`
  - `vitest run src/services/__tests__/MediaStorageService.test.ts src/services/__tests__/TimelineAudioEngine.test.ts src/services/__tests__/WaveformAnalysisService.test.ts`

## Change Log

- `2026-03-15`: initial ticket created from release audit
- `2026-03-15`: added explicit `availability` status to `MediaItem`, marked missing linked files as `unavailable-linked`, and covered the unavailable path in media-storage tests
