# AUTEURA-118: Establish controller refactor guardrails before extraction

- Status: `done`
- Severity: `medium`
- Release Gate: `pre_scale`
- Owner: `unassigned`
- Created: `2026-03-26`
- Updated: `2026-03-26`
- Dependencies: `none`

## Summary

The large controller facades can be extracted safely only if their public contracts, protected flows, and review expectations are frozen first.

## Problem

[`RenderController.tsx`](../../../src/controllers/RenderController.tsx), [`AIController.tsx`](../../../src/controllers/AIController.tsx), [`RecordingController.tsx`](../../../src/controllers/RecordingController.tsx), and [`TimelineController.tsx`](../../../src/controllers/TimelineController.tsx) already act as React-facing subsystem boundaries, but the repo had no controller contract document, no protected-flow ownership map, and no controller characterization coverage to prevent extraction drift.

## Why It Matters

Without explicit guardrails, controller extractions can pass typecheck while silently regressing fallback behavior, storage flows, or timeline/export semantics that are only partially visible in code review.

## Failure Mode

- trigger: extracting controller internals into services or coordinators without freezing the public facade first
- observable behavior: React consumers keep compiling while state meaning, command behavior, or protected flow ownership drifts
- likely user impact: regressions in critical capture, render, or timeline workflows discovered late by E2E or after release

## Scope

- affected files:
  - [`src/controllers/RenderController.tsx`](../../../src/controllers/RenderController.tsx)
  - [`src/controllers/AIController.tsx`](../../../src/controllers/AIController.tsx)
  - [`src/controllers/RecordingController.tsx`](../../../src/controllers/RecordingController.tsx)
  - [`src/controllers/TimelineController.tsx`](../../../src/controllers/TimelineController.tsx)
  - [`src/controllers/__tests__/RenderController.test.tsx`](../../../src/controllers/__tests__/RenderController.test.tsx)
  - [`docs/architecture/controller-facades.md`](../../architecture/controller-facades.md)
  - [`docs/tracking/refactor-guardrails.md`](../refactor-guardrails.md)
  - [`CONTRIBUTING.md`](../../../CONTRIBUTING.md)
- affected subsystems:
  - controller facades
  - refactor review process
  - extraction safety
- out of scope:
  - the extraction work itself
  - unrelated runtime bug fixes

## Acceptance Criteria

- [x] controller facade responsibilities and stable output shapes are documented
- [x] critical flows are mapped to owning facades and supporting subsystems
- [x] the contribution/review process requires refactor PRs to declare touched protected flows and contract impact
- [x] controller characterization coverage exists at the next extraction seam

## Implementation Notes

- keep the contract source of truth anchored to the context value interfaces in the controller files
- start characterization with `RenderController`, because renderer extraction is the next intended seam and its failure-state publication recently changed

## Validation

- required automated checks:
  - controller characterization coverage for render runtime publication
  - repo verification for docs and tests
- required manual/runtime checks:
  - none
- closure evidence:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test:unit`
  - `npm run build`
  - `npm run test:e2e`

## Change Log

- `2026-03-26`: initial ticket created from refactor planning audit
- `2026-03-26`: added controller-facade contract docs, protected-flow ownership/checklist, and render-controller characterization coverage
