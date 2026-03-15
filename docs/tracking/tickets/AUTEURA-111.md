# AUTEURA-111: Recover renderer after frame exceptions

- Status: `ready`
- Severity: `high`
- Release Gate: `release_blocker`
- Owner: `unassigned`
- Created: `2026-03-15`
- Updated: `2026-03-15`
- Dependencies: `none`

## Summary

One render-frame exception can permanently stop the preview loop without an automatic recovery path.

## Problem

[RenderController.tsx](../../src/controllers/RenderController.tsx#L730) cancels the RAF loop on render errors and leaves recovery up to an external remount or full refresh.

## Why It Matters

Transient pass failures should degrade gracefully, not permanently kill the monitor.

## Failure Mode

- trigger: transient render pass error, bad source frame, or renderer edge case
- observable behavior: monitor freezes or stays black until reload
- likely user impact: apparent product instability during capture or preview

## Scope

- affected files:
  - [RenderController.tsx](../../src/controllers/RenderController.tsx#L730)
  - [GLRenderer.ts](../../src/engine/GLRenderer.ts)
- affected subsystems:
  - render loop
  - fallback behavior
- out of scope:
  - full renderer rewrite

## Acceptance Criteria

- [ ] transient frame errors trigger bounded recovery instead of permanent preview death
- [ ] fallback to 2D or controlled renderer reinit happens automatically when appropriate
- [ ] repeated failures surface a stable user-visible error state instead of a dead loop

## Implementation Notes

- recovery must be bounded to avoid infinite reinit loops
- diagnostics should record the active backend after fallback

## Validation

- required automated checks:
  - render-loop recovery test after injected pass failure
- required manual/runtime checks:
  - verify preview recovers or cleanly falls back without refresh
- closure evidence:
  - pending

## Change Log

- `2026-03-15`: initial ticket created from release audit
