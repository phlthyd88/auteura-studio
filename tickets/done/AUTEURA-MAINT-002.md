# AUTEURA-MAINT-002 — Address RenderController/Viewfinder review fixes

## Metadata
- Status: READY_FOR_REVIEW
- Type: bug
- Priority: P1
- Owner: codex
- Created: 2026-03-27
- Related:
- Depends on:
- Blocks:

## Problem Statement
Two narrow review issues remain in the renderer-facing code. `RenderController` does not currently contain construction-time failures from `createStudioRenderer` inside the same controlled initialization error path as `initialize()`, and `Viewfinder` widens the renderer runtime reason type locally instead of using the specific shared runtime-reason type.

## Why This Matters
If `createStudioRenderer` throws during renderer construction, that failure can escape the React effect instead of being translated into the unified `RendererRuntimeState` error publication path. Separately, widening the runtime-reason type in `Viewfinder` weakens exhaustiveness around renderer failure reasons and makes future additions easier to miss.

## Scope
- Move `createRenderer(renderCanvasElement)` inside the same `try/catch` as renderer initialization in `src/controllers/RenderController.tsx`.
- Restore controlled runtime-error publication for construction-time renderer failures.
- Keep `destroyRenderer()` correct on both success and failure paths.
- Change `formatRendererRuntimeReason` in `src/components/layout/Viewfinder.tsx` to use `RendererRuntimeReason | null` and keep the switch exhaustive.
- Add or update one focused test for construction-time `createRenderer` failure if the existing controller test surface supports it cleanly.

## Out of Scope
Do not refactor unrelated renderer logic, change runtime semantics outside the two review comments, or widen this into broader controller/view cleanup.

## Acceptance Criteria
- [x] Construction-time failures from `createStudioRenderer` are converted into controlled renderer runtime error state rather than escaping the effect.
- [x] `destroyRenderer()` remains correct on success and failure paths.
- [x] `Viewfinder` uses the specific renderer runtime-reason type and preserves switch exhaustiveness.
- [x] Focused validation covers the construction-time failure path and the requested type/lint checks pass.

## Constraints
- Keep the renderer runtime publication coherent with the existing unified `RendererRuntimeState` design.
- Prefer existing exported/shared types over local widening if practical.
- Keep the change set narrow to the review comments and the directly implicated test.

## Context / Affected Areas
- `src/controllers/RenderController.tsx`
- `src/components/layout/Viewfinder.tsx`
- `src/controllers/__tests__/RenderController.test.tsx`
- `src/engine/__tests__/GLRenderer.test.ts`

## Root Cause Analysis
Fill this in before coding.
- Root cause: `initializeRenderer()` destroys any existing renderer before entering a `try/catch`, but it constructs the next renderer outside that `try/catch`, so construction-time failures do not flow through the controlled runtime publication path. Separately, `Viewfinder` accepts `string | null` for runtime reasons even though `RenderController` already defines a narrower runtime-reason union.
- Symptom vs actual failure: the visible symptom is a review comment about error containment and typing. The actual failures are: a construction-time renderer error can escape the React effect instead of updating `rendererRuntime`, and the UI-side reason formatter loses compile-time exhaustiveness by widening the type.
- Why current behavior happens: `initializeRenderer()` currently assumes `createRenderer()` itself is safe and only guards `nextRenderer.initialize()`, while `RendererRuntimeReason` is defined in `RenderController` but not reused by `Viewfinder`.
- Context check: the existing controller test surface already mocks `createStudioRenderer`, so it supports a focused construction-failure test without introducing new harnesses.

## Architecture Check
- Existing abstractions involved: `RenderController` owns unified renderer runtime publication; `Viewfinder` is a consumer of that published runtime state; `createStudioRenderer` is the construction seam.
- Existing conventions involved: renderer failures should publish through `RendererRuntimeState` instead of escaping effects; runtime reason unions should stay explicit and exhaustive.
- Boundary concerns: the fix must stay inside the existing controller/runtime abstraction and should not introduce new public state fields or refactor the renderer lifecycle.
- Should this be local, extracted, or refactored? Local, focused fix.

## Blast Radius
- Upstream impact: none outside renderer initialization and UI reason formatting.
- Downstream impact: `Viewfinder` error text and any renderer-startup effect failures depend on this logic staying coherent.
- Regression risks: mishandling `destroyRenderer()` could leak or double-dispose renderers; mismatching runtime reasons could drift from the unified runtime state model.
- Adjacent systems to verify: `RenderController` facade tests and the existing renderer unit tests.

## Invariants
- `rendererRuntime`, `rendererError`, `webglDiagnostics`, and `isContextLost` must remain coherent and derived from the same runtime state model.
- Construction-time renderer failures must publish a controlled runtime error state rather than escape the React effect.
- `Viewfinder` must not widen the renderer runtime-reason domain beyond the controller-owned union.

## Implementation Plan
- [x] Triage the review comments and confirm the narrow fix shape.
- [x] Implement the two requested fixes plus the directly implicated focused test update.
- [x] Run the requested validation commands and document exact results.

## Validation Plan
List the exact commands or verification steps you expect to run.
- [x] typecheck
- [x] lint
- [x] unit tests
- [x] integration tests not required unless the focused controller test surface proves insufficient
- [x] e2e tests not required for this narrow review fix
- [x] build not required unless the code changes reveal a broader compile issue
- [x] manual verification if needed

Commands:
```bash
volta run npm run typecheck
volta run npm run lint
volta run npx vitest run src/controllers/__tests__/RenderController.test.tsx src/engine/__tests__/GLRenderer.test.ts
```

## Progress Log
### 2026-03-27 00:35
- moved the ticket to `tickets/review/` with `Status: READY_FOR_REVIEW`
- review should focus on the two requested comments only: construction-time renderer failure containment and `Viewfinder` runtime-reason typing

### 2026-03-27 00:34
- restored dependencies after `npm run clean` had removed `node_modules`; the first sandboxed `npm ci` failed in `esbuild` postinstall with `spawnSync ... EPERM`, and the escalated retry succeeded
- ran the requested validation commands:
  - `volta run npm run typecheck`
  - `volta run npm run lint`
  - `volta run npx vitest run src/controllers/__tests__/RenderController.test.tsx src/engine/__tests__/GLRenderer.test.ts`
- validation is green and the fix remains narrow to the requested review comments

### 2026-03-27 00:08
- updated `RenderController.initializeRenderer()` so renderer construction and initialization now share the same controlled error-containment path
- exported the existing `RendererRuntimeReason` type from `RenderController` and reused it in `Viewfinder`
- added a focused controller test for construction-time `createStudioRenderer` failure
- kept scope limited to the two review comments plus the directly implicated test

### 2026-03-27 00:03
- moved the ticket into `tickets/in-progress/` and advanced the status to `IN_PROGRESS`
- implementation will stay limited to:
  - containing `createRenderer()` construction failures inside `initializeRenderer()`'s controlled runtime-error path
  - tightening `Viewfinder` to the shared `RendererRuntimeReason | null` type with an exhaustive formatter
  - adding one focused controller test for construction-time renderer failure

### 2026-03-27 00:02
- created a new narrow review-fix ticket because no existing ticket covered these PR comments
- moved the ticket from `NEW` to `TRIAGED` while keeping it in `tickets/backlog/`
- confirmed the fix surface is local:
  - `RenderController` needs construction-time renderer failures contained inside `initializeRenderer()`'s controlled error publication path
  - `Viewfinder` should reuse the controller-owned runtime-reason type instead of accepting `string | null`
- confirmed the current controller test harness already mocks `createStudioRenderer`, so a focused construction-failure test is practical without widening scope

## Changed Files
- tickets/review/AUTEURA-MAINT-002.md
- src/controllers/RenderController.tsx
- src/components/layout/Viewfinder.tsx
- src/controllers/__tests__/RenderController.test.tsx

## Validation Results
Record exact commands and results.

```bash
volta run npm ci
# first attempt result: failed
# error: esbuild postinstall spawnSync /home/alfie-basic/auteura-studio/node_modules/esbuild/bin/esbuild EPERM
# classification: environment/sandbox issue after dependencies had been removed by `npm run clean`

volta run npm ci
# escalated retry result: passed

volta run npm run typecheck
# result: passed

volta run npm run lint
# result: passed

volta run npx vitest run src/controllers/__tests__/RenderController.test.tsx src/engine/__tests__/GLRenderer.test.ts
# result: passed
# summary: 2 passed files, 11 passed tests
```

## Blockers
If blocked, record:
- exact blocker
- exact failed command
- exact error
- whether environment provisioning was attempted
- what remains unverified

## Residual Risks
- This ticket does not validate broader browser-level renderer flows because the review comments were narrowly about controller construction error containment and UI-side type exhaustiveness.
- The worktree may contain unrelated in-flight changes outside this ticket; this ticket’s validation is scoped to the requested commands and touched files.

## Final Summary
Addressed the two review comments without widening scope. In `RenderController`, `createRenderer(renderCanvasElement)` now runs inside the same `try/catch` as renderer initialization so construction-time failures from `createStudioRenderer` publish the same controlled `RendererRuntimeState` error path instead of escaping the React effect, while `destroyRenderer()` still clears any prior renderer before construction and disposes a newly created renderer only when one actually exists. In `Viewfinder`, `formatRendererRuntimeReason()` now uses the exported `RendererRuntimeReason | null` type from `RenderController` and preserves exhaustiveness with a `never` check instead of accepting `string | null`. Added a focused controller test for construction-time renderer failure and validated the requested typecheck, lint, and Vitest command set.
