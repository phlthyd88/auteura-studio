# AUTEURA-109: Stream generated-track export output instead of buffering

- Status: `ready`
- Severity: `critical`
- Release Gate: `release_blocker`
- Owner: `unassigned`
- Created: `2026-03-15`
- Updated: `2026-03-15`
- Dependencies: `none`

## Summary

Timeline export with generated tracks still accumulates all recorder chunks in memory before creating the final export blob.

## Problem

[TimelineExportService.ts](../../src/services/TimelineExportService.ts#L655) stores generated export chunks in an array and constructs a final blob after recording finishes.

## Why It Matters

Long exports can still fail late with peak-memory exhaustion even though recording ingestion was fixed.

## Failure Mode

- trigger: export a longer composition with generated output
- observable behavior: memory climbs throughout export, then the tab stalls or crashes near completion
- likely user impact: export failure and possible loss of time spent waiting for completion

## Scope

- affected files:
  - [TimelineExportService.ts](../../src/services/TimelineExportService.ts#L655)
  - [MediaStorageService.ts](../../src/services/MediaStorageService.ts)
- affected subsystems:
  - export pipeline
  - persistence
- out of scope:
  - codec selection redesign

## Acceptance Criteria

- [ ] generated-track export persists chunks incrementally instead of retaining the full file in RAM
- [ ] failed or cancelled exports clean up partial output
- [ ] completed exports remain playable and metadata is correct
- [ ] peak JS heap does not scale with total output duration

## Implementation Notes

- reuse the chunk-backed persistence approach from recording where practical
- keep export temp storage separate from user-visible media until finalize succeeds

## Validation

- required automated checks:
  - unit/integration test for chunked export persistence
  - regression test for cleanup on failure
- required manual/runtime checks:
  - long export smoke test in browser
- closure evidence:
  - pending

## Change Log

- `2026-03-15`: initial ticket created from release audit
