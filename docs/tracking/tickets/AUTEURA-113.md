# AUTEURA-113: Guard async camera device refresh after unmount

- Status: `ready`
- Severity: `medium`
- Release Gate: `pre_scale`
- Owner: `unassigned`
- Created: `2026-03-15`
- Updated: `2026-03-15`
- Dependencies: `none`

## Summary

The camera device refresh path can resolve after teardown and still write React state.

## Problem

[CameraController.tsx](../../src/controllers/CameraController.tsx#L106) awaits `enumerateDevices()` without a mounted guard.

## Why It Matters

This causes stale writes and makes lifecycle boundaries less trustworthy during device hot-swap and teardown.

## Acceptance Criteria

- [ ] late device refresh completions are ignored after unmount
- [ ] no state writes occur from a stale request
- [ ] hot-swap still updates device state correctly while mounted

## Validation

- required automated checks:
  - mount/unmount race test around device refresh
- closure evidence:
  - pending

## Change Log

- `2026-03-15`: initial ticket created from release audit
