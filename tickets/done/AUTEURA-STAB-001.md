# AUTEURA-STAB-001 — Reproduce WebGL lost-on-acquire startup failure

## Metadata
- Status: DONE
- Type: stabilization
- Priority: P0
- Owner: codex
- Created: 2026-03-26
- Related:
- Depends on:
- Blocks:

## Problem Statement
Current baseline can enter a state where WebGL is unavailable or acquired in a lost state and the monitor does not degrade cleanly.

## Why This Matters
Without deterministic reproduction, fixes will remain theory-driven and fragile.

## Scope
Reproduce blocked webgl, blocked experimental-webgl, lost-on-acquire, and GPU-disabled startup paths. Capture diagnostics, console errors, and rendered monitor state.

## Out of Scope
Do not refactor renderer architecture in this ticket.

## Acceptance Criteria
- [x] Repro steps are documented.
- [x] At least one deterministic test or harness exists.
- [x] Failure modes are classified by backend and diagnostic outcome.

## Constraints
Maintain current public behavior unless the ticket explicitly changes it.

## Context / Affected Areas
GLRenderer initialization, RenderController startup, fallback monitor behavior.

## Root Cause Analysis
- Root cause: The renderer startup branches already exist in `GLRenderer` and `RenderController`, but the repo does not have one deterministic reproduction matrix that exercises and classifies all startup failure paths at the browser level. Null-context fallback is browser-covered, while lost-on-acquire and unreadable-limit branches are only unit-covered and not documented as a single startup-failure matrix.
- Symptom vs actual failure: The visible symptom is "WebGL startup can fail or acquire a lost context and the monitor may not degrade cleanly." The actual gap for this ticket is narrower: reproducibility and classification are incomplete, so observed failures cannot be proven and compared consistently before or after follow-up fixes.
- Why current behavior happens: `GLRenderer.initialize()` distinguishes `webgl-unavailable`, `context-acquired-lost`, and `gpu-limits-unreadable`, and `RenderController` now publishes unified runtime state, but there is no dedicated deterministic harness or browser-level spec that maps those branches to expected diagnostics, console behavior, and rendered monitor outcome in one place.

## Architecture Check
- Existing abstractions involved: `GLRenderer` owns startup context acquisition and diagnostics; `RenderController` owns runtime-state publication; `Viewfinder` and `AppLayout` expose user-facing diagnostics; Playwright already provides a fake camera bootstrap in `e2e/critical-path.spec.ts`.
- Existing conventions involved: keep startup diagnostics in `GLRenderer`, keep UI/runtime wiring in `RenderController`, use Vitest for branch-level unit coverage, and use Playwright for browser-visible fallback behavior.
- Boundary concerns: this ticket should add deterministic reproduction and classification without broadening into renderer-architecture refactors or reworking the existing runtime-state model.
- Should this be local, extracted, or refactored? Local. The right shape is a focused startup-failure harness/spec plus ticket documentation, not a new abstraction.

## Blast Radius
- Upstream impact: none on camera or AI inputs if the work stays inside renderer startup harnessing and diagnostics assertions.
- Downstream impact: browser-level diagnostics assertions will depend on `Viewfinder` and `AppLayout` text, so the harness should assert stable runtime state rather than brittle incidental copy where possible.
- Regression risks: test shims could accidentally return unrealistic fake contexts that do not exercise the real startup branches; browser assertions could become too tightly coupled to presentation text.
- Adjacent systems to verify: `GLRenderer` diagnostics, `RenderController` runtime publication, `Viewfinder` backend/failure labels, and the existing WebGL fallback Playwright coverage.

## Implementation Plan
- [x] Triage the problem and confirm root cause.
- [x] Add a deterministic startup-failure matrix that covers blocked contexts, lost-on-acquire, and unreadable GPU-limit branches.
- [x] Document the classified backend/diagnostic outcomes and repro steps in this ticket as validation evidence.
- [x] Run validation and document results before moving the ticket forward.

## Validation Plan
List the exact commands or verification steps you expect to run.
- [x] typecheck
- [x] lint
- [x] unit tests
- [x] integration tests
- [x] e2e tests
- [x] build
- [x] manual verification if needed

Commands:
```bash
volta run npm run typecheck
volta run npm run lint
volta run npx vitest run src/engine/__tests__/GLRenderer.test.ts
REAL_NODE_BIN=$(dirname "$(volta which npm)") && PATH="$REAL_NODE_BIN:$PATH" volta run npx playwright test e2e/render-startup-failures.spec.ts
volta run npm run build
# if the new browser harness touches shared startup behavior, rerun:
REAL_NODE_BIN=$(dirname "$(volta which npm)") && PATH="$REAL_NODE_BIN:$PATH" volta run npm run test:e2e
```

## Progress Log
### 2026-03-26 22:54
- completed the broader validation set after the focused startup-failure matrix passed
- full Playwright suite is green with the shared bootstrap helper and the narrowed connected-canvas shim
- no in-scope regressions, unrelated pre-existing failures, or environment/tooling failures remained in the successful validation run
- moved the ticket to `tickets/review/` with `Status: READY_FOR_REVIEW`

### 2026-03-26 22:48
- reran the focused Playwright startup-failure matrix after narrowing the WebGL shim to connected canvases only
- confirmed the prior targeted failure was harness overreach: the fake lost/unreadable contexts were being handed to the hardware-profiler startup canvas, not just the render canvas
- the focused matrix now passes for all three intended cases:
  - null WebGL context on startup: pass
  - lost-on-acquire startup: pass
  - unreadable GPU-limit startup: pass
- proceeding to the broader validation set because the targeted reproduction matrix is now stable

### 2026-03-26 22:31
- extracted the existing Playwright fake camera/runtime bootstrap into a shared helper to avoid duplicating the browser shim
- added a dedicated browser-level startup-failure matrix spec covering null-context startup, lost-on-acquire startup, and unreadable GPU-limit startup
- kept the scope limited to deterministic reproduction/classification; no renderer production code changed in this ticket
- validation still pending

### 2026-03-26 22:24
- moved the ticket into `tickets/in-progress/` and advanced the status to `IN_PROGRESS`
- implementation approach selected: add a dedicated browser-level startup-failure matrix and keep the scope local to reproducibility/classification
- expected code touchpoints are the Playwright harness and ticket evidence, not renderer behavior itself

### 2026-03-26 22:20
- moved the ticket from `NEW` to `TRIAGED` while keeping it in `tickets/backlog/`
- confirmed the current code already contains the startup branches for `webgl-unavailable`, `context-acquired-lost`, and `gpu-limits-unreadable`
- confirmed the current gap is missing deterministic end-to-end reproduction/classification rather than missing fallback logic
- no code changes started yet; next step is to add the smallest focused harness/spec and then move the ticket to `tickets/in-progress/`

## Changed Files
- tickets/review/AUTEURA-STAB-001.md
- e2e/helpers/installFakeStudioRuntime.ts
- e2e/render-startup-failures.spec.ts
- e2e/critical-path.spec.ts

## Validation Results
Record exact commands and results.

```bash
volta run npm run typecheck
# result: passed

volta run npm run lint
# result: passed

volta run npx vitest run src/engine/__tests__/GLRenderer.test.ts
# result: passed
# summary: 1 passed file, 7 passed tests

volta run npm run test:unit
# result: passed
# summary: 36 passed files, 132 passed tests

volta run npm run test
# result: passed
# summary: 36 passed files, 132 passed tests

volta run npm run build
# result: passed

REAL_NODE_BIN=$(dirname "$(volta which npm)") && PATH="$REAL_NODE_BIN:$PATH" volta run npx playwright test e2e/render-startup-failures.spec.ts --reporter=line
# result: passed
# - classifies null WebGL startup fallback
# - classifies lost-on-acquire startup via the primary webgl context
# - classifies unreadable GPU-limit startup failure
# summary: 3 passed (27.6s)

REAL_NODE_BIN=$(dirname "$(volta which npm)") && PATH="$REAL_NODE_BIN:$PATH" volta run npm run test:e2e
# result: passed
# summary: 12 passed (2.6m)
```

Repro/classification notes:
- deterministic browser-level harness: `e2e/render-startup-failures.spec.ts`
- prior failed targeted run was caused by harness overreach into the hardware-profiler startup path; narrowing the shim to `HTMLCanvasElement` instances with `isConnected === true` isolated the reproduction to the real render canvas
- classified outcomes:
  - null WebGL startup: backend `canvas-2d`, runtime status `fallback`, failure reason `WebGL unavailable`
  - lost-on-acquire startup: backend `canvas-2d`, runtime status `fallback`, failure reason `context acquired lost`
  - unreadable GPU-limit startup: backend `canvas-2d`, runtime status `fallback`, failure reason `GPU limits unreadable`

Failure classification from the successful full-suite run:
- in-scope regressions for this ticket: none
- unrelated pre-existing failures: none
- environment/tooling issues: none

## Blockers
If blocked, record:
- exact blocker
- exact failed command
- exact error
- whether environment provisioning was attempted
- what remains unverified

## Residual Risks
- Browser-level startup shims must stay aligned with the real `GLRenderer` branch checks, or the harness will only prove the shim.
- Follow-up tickets (`AUTEURA-STAB-002` through `AUTEURA-STAB-005`) still depend on this ticket producing a trustworthy startup-failure matrix.

## Final Summary
Added a focused browser-level startup-failure matrix that deterministically reproduces and classifies null-context, lost-on-acquire, and unreadable GPU-limit renderer startup failures without changing renderer production code. Reused the existing Playwright fake camera/runtime bootstrap through a shared helper, narrowed the WebGL shim to connected render canvases only to avoid hardware-profiler overreach, and validated the targeted matrix plus the broader repository validation set. The ticket is ready for review.
