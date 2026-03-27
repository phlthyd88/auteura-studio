# AUTEURA-119: Investigate intermittent hidden-tab timelapse shot-count drift

- Status: `identified`
- Severity: `high`
- Release Gate: `pre_scale`
- Owner: `unassigned`
- Created: `2026-03-26`
- Updated: `2026-03-26`
- Dependencies: `none`

## Summary

One full critical-path Playwright run exceeded the hidden-tab timelapse shot-count bounds, but the latest rerun passed, so the current problem is an intermittent cadence or test-stability failure.

## Problem

[`e2e/critical-path.spec.ts`](../../../e2e/critical-path.spec.ts) has observed a case where timelapse capture should pause while hidden and resume without bursting missed shots, but a prior full-suite run overshot the expected bounds while the latest rerun passed.

## Why It Matters

This undermines confidence in hidden-tab timelapse cadence and reduces trust in the critical-path suite even when the latest rerun passes.

## Failure Mode

- trigger: start timelapse, hide the tab through the visibility test shim, wait, then restore visibility
- observable behavior: shot count can grow beyond the allowed pause/resume bounds and persisted timelapse item count can overshoot expectations
- likely user impact: extra captures, inconsistent shot counts, or intermittent CI noise around the hidden-tab cadence contract

## Scope

- affected files:
  - [`src/controllers/RecordingController.tsx`](../../../src/controllers/RecordingController.tsx)
  - [`e2e/critical-path.spec.ts`](../../../e2e/critical-path.spec.ts)
- affected subsystems:
  - timelapse worker lifecycle
  - hidden-tab pause/resume behavior
  - media persistence cadence
- out of scope:
  - renderer stabilization
  - render-controller extraction guardrails

## Acceptance Criteria

- [ ] hidden-tab timelapse pauses deterministically without accumulating missed captures
- [ ] resuming visibility schedules the next shot from the restored cadence instead of bursting backlog work
- [ ] the hidden-tab timelapse critical-path test passes reliably

## Implementation Notes

- investigate whether the bug lives in worker tick cadence, hidden-tab pause state publication, or persisted shot accounting
- treat this as independent from the renderer stabilization tranche unless new evidence proves coupling

## Validation

- required automated checks:
  - `playwright test e2e/critical-path.spec.ts -g "pauses timelapse while hidden and does not burst missed captures on resume"`
- required manual/runtime checks:
  - verify shot count does not drift during hide/resume cycles
- closure evidence:
  - previous full-suite failure observed during `npm run test:e2e`
  - latest rerun of `npm run test:e2e` passed

## Change Log

- `2026-03-26`: ticket created after full Playwright verification reproduced the hidden-tab timelapse failure
- `2026-03-26`: latest full Playwright rerun passed; ticket retained as an intermittent cadence/flake investigation
