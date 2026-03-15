# AUTEURA-110: Stop strict media access from hydrating full large assets

- Status: `done`
- Severity: `high`
- Release Gate: `release_blocker`
- Owner: `unassigned`
- Created: `2026-03-15`
- Updated: `2026-03-15`
- Dependencies: `AUTEURA-109` recommended

## Summary

Large copied and chunked media still get reassembled into full in-memory blobs when strict access is requested for preview, download, or timeline flows.

## Problem

[MediaStorageService.ts](../../src/services/MediaStorageService.ts#L670) and [MediaStorageService.ts](../../src/services/MediaStorageService.ts#L726) reconstruct full assets for strict reads, and consumers like [TimelineController.tsx](../../src/controllers/TimelineController.tsx#L672) depend on that path directly.

## Why It Matters

Metadata-first listing fixed one OOM class, but user-facing large-asset actions can still allocate the whole payload in JS.

## Failure Mode

- trigger: preview, analyze, or download a very large recording
- observable behavior: sudden memory spike and possible tab crash or long stall
- likely user impact: media appears unstable or unusable despite successful ingest

## Scope

- affected files:
  - [MediaStorageService.ts](../../src/services/MediaStorageService.ts#L670)
  - [TimelineController.tsx](../../src/controllers/TimelineController.tsx#L672)
  - [MediaLibrary.tsx](../../src/components/MediaLibrary.tsx#L143)
- affected subsystems:
  - persistence
  - preview/download paths
  - timeline ingest
- out of scope:
  - transcoding pipeline redesign

## Acceptance Criteria

- [x] preview and download paths do not require full-blob hydration for large assets
- [x] chunked recordings can be consumed via stream, slice, or object URL strategy with bounded memory
- [x] existing metadata-first list behavior remains intact

## Implementation Notes

- define explicit access modes for metadata, preview, stream, and strict full payload
- avoid teaching every consumer to call `getMediaById()` for whole payloads

## Validation

- required automated checks:
  - test for large chunked asset preview/download path
- required manual/runtime checks:
  - open and preview a very large recording without heap spike
- closure evidence:
  - `npm run typecheck`
  - `vitest run src/services/__tests__/MediaStorageService.test.ts src/services/__tests__/TimelineExportService.test.ts`
  - `playwright test e2e/critical-path.spec.ts -g "exports a WebM timeline with a multi-segment playable source"`

## Change Log

- `2026-03-15`: initial ticket created from release audit
- `2026-03-15`: replaced blob-hydrating preview/export source reads with playback handles, switched chunked preview/download reads to sequential chunk access, and validated with focused unit/browser coverage
