# AUTEURA-114: Represent unavailable linked media truthfully

- Status: `ready`
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

- [ ] unavailable linked media has an explicit runtime type or status
- [ ] UI can distinguish unavailable media from valid empty files
- [ ] preview/export flows fail fast with a useful recovery path

## Validation

- required automated checks:
  - unavailable linked media behavior test
- closure evidence:
  - pending

## Change Log

- `2026-03-15`: initial ticket created from release audit
