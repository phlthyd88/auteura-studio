# AUTEURA-STAB-002 — Make renderer startup and failure state deterministic

## Metadata
- Status: DONE
- Type: stabilization
- Priority: P0
- Owner: codex
- Created: 2026-03-27
- Related: AUTEURA-STAB-001, AUTEURA-STAB-006, AUTEURA-111, AUTEURA-117
- Depends on:
- Blocks:

## Problem Statement
Renderer teardown currently forces `WEBGL_lose_context` during `GLRenderer.dispose()`. In React 18 Strict Mode, effect setup/cleanup/setup runs against the same preserved `<canvas>` element in development, so the queued `webglcontextlost` event from teardown can be caught by the next mount and published as a real runtime failure.

## Why This Matters
The renderer must publish a coherent runtime state for real startup and runtime failures, not for self-inflicted teardown during development lifecycle probing. If the dispose path poisons the next mount, the monitor can hang in `context-lost` even though the GPU did not actually fail.

## Scope
Fix the renderer teardown path so normal disposal does not synthesize a later `webglcontextlost` failure on the next mount of the same canvas. Preserve deterministic fallback/runtime behavior for real startup failures.

## Out of Scope
Do not broaden scope into unrelated UI polish, controller refactors, or new renderer feature work.

## Acceptance Criteria
- [x] Normal renderer disposal does not force a later `webglcontextlost` transition on a remounted `RenderController`.
- [x] Real startup-failure fallback behavior remains deterministic.
- [x] Teardown still disposes pipeline-owned GPU resources correctly.

## Constraints
Maintain current public behavior unless the ticket explicitly changes it.

## Context / Affected Areas
GLRenderer diagnostics, RenderController runtime state, startup failure branches.

## Root Cause Analysis
- Root cause: `GLRenderer.dispose()` explicitly calls `WEBGL_lose_context.loseContext()` after pipeline disposal. In React 18 Strict Mode, the first effect cleanup can enqueue `webglcontextlost` on the same canvas instance that the second effect setup immediately reuses. `RenderController` then treats that teardown-originated event as a genuine context-loss failure and publishes `context-lost`.
- Symptom vs actual failure: the visible symptom is the UI hanging in `WebGL context lost. Waiting for restoration.` during development or remount churn. The actual failure is not startup fallback selection; it is an invalid teardown contract where disposal synthesizes an asynchronous failure event that escapes its lifecycle boundary and contaminates the next renderer instance.
- Why current behavior happens: `RenderController` correctly listens for real `webglcontextlost` / `webglcontextrestored` events on the canvas. `GLRenderer.dispose()` currently weaponizes that same browser mechanism for cleanup. Because React Strict Mode preserves the DOM node across the setup/cleanup/setup probe, the queued lost-context event outlives the old renderer instance and is observed by the new one.
- Context check: the relevant teardown code in `GLRenderer`, event handlers in `RenderController`, React Strict Mode enablement in `src/main.tsx`, and existing `GLRenderer` dispose tests are all present locally and readable.

## Architecture Check
- Existing abstractions involved: `GLRenderer` owns low-level WebGL resource lifecycle; `RenderController` owns runtime-state publication from genuine browser/renderer failures.
- Existing conventions involved: teardown should release owned resources but must not publish new runtime-failure signals into a future controller lifecycle unless a real external failure occurred.
- Boundary concerns: the fix belongs in renderer disposal semantics, not in suppressing `webglcontextlost` inside `RenderController`, because the controller should continue to trust real browser events.
- Should this be local, extracted, or refactored? Local fix in `GLRenderer` plus focused regression tests.

## Blast Radius
- Upstream impact: Strict Mode development startup/remount behavior and any other mount/unmount churn on the render canvas depend on correct teardown semantics.
- Downstream impact: if disposal remains self-poisoning, renderer runtime-state diagnostics become less trustworthy and local development can misclassify teardown as GPU failure.
- Regression risks: removing `loseContext()` must not leak pipeline-owned resources or weaken real startup-failure fallback behavior.
- Adjacent systems to verify: `src/engine/__tests__/GLRenderer.test.ts`, any `RenderController` test surface that can cover remount behavior cleanly, and the existing startup-failure Playwright matrix to prove no regression.

## Invariants
- Startup failures must still resolve to one coherent runtime/backend/fallback state.
- Renderer disposal must release pipeline-owned resources exactly once.
- Teardown must not synthesize a later context-loss failure for the next renderer lifecycle on the same canvas.

## Implementation Plan
- [x] Triage the problem and confirm root cause.
- [x] Audit the current startup-failure browser matrix and renderer runtime code against the acceptance criteria.
- [x] Reclassify the ticket from stale backlog drift to a real renderer teardown bug based on new code-level evidence.
- [x] Remove the artificial `loseContext()` disposal path while preserving pipeline cleanup and idempotent dispose behavior.
- [x] Update focused renderer tests to prove disposal remains correct without forcing browser context-loss.
- [x] Rerun targeted validation and document exact results.

## Validation Plan
List the exact commands or verification steps you expect to run.
- [ ] typecheck
- [ ] lint
- [ ] unit tests
- [ ] integration tests not required
- [ ] e2e tests if needed for confidence after the local fix
- [x] manual verification via source and existing test audit

Commands:
```bash
sed -n '1,260p' e2e/render-startup-failures.spec.ts
sed -n '1,140p' src/engine/GLRenderer.ts
sed -n '900,980p' src/controllers/RenderController.tsx
rg -n "loseContext|webglcontextlost|webglcontextrestored|StrictMode" src/engine/GLRenderer.ts src/controllers/RenderController.tsx src/main.tsx src/engine/__tests__/GLRenderer.test.ts
volta run npm run typecheck
volta run npm run lint
volta run npx vitest run src/engine/__tests__/GLRenderer.test.ts
```

## Progress Log
### 2026-03-27 06:50 EDT
- revalidated the current source after a code/ticket-drift review
- confirmed `src/engine/GLRenderer.ts` still contains the intended teardown fix: normal disposal does not call `WEBGL_lose_context.loseContext()`
- confirmed `src/engine/__tests__/GLRenderer.test.ts` still encodes the non-forced-context-loss disposal behavior

### 2026-03-27 05:15
- completed targeted validation for the renderer teardown fix
- results:
  - `volta run npm run typecheck` passed
  - `volta run npm run lint` passed
  - `volta run npx vitest run src/engine/__tests__/GLRenderer.test.ts` passed (`7 passed`)
  - `volta run npx playwright test e2e/render-startup-failures.spec.ts --reporter=line` passed on rerun with local web-server bind permissions (`3 passed`)
- moved the ticket to `tickets/review/` with `Status: READY_FOR_REVIEW`

### 2026-03-27 03:53
- implemented the narrow renderer teardown fix in `src/engine/GLRenderer.ts`
  - removed the explicit `WEBGL_lose_context.loseContext()` call from normal disposal
  - kept `pipeline.dispose(activeContext)` and idempotent `isDisposed` guarding intact
- updated `src/engine/__tests__/GLRenderer.test.ts`
  - rewrote the disposal expectation to prove pipeline cleanup happens without forcing browser context loss
  - kept the idempotent-dispose coverage and updated it to assert `loseContext()` is not called
- [x] typecheck
- [x] lint
- [x] unit tests
- [ ] integration tests not required
- confirmed code path:
  - `GLRenderer.dispose()` currently calls `activeContext.getExtension('WEBGL_lose_context')?.loseContext?.()`
  - `RenderController` listens for `webglcontextlost` on the canvas and publishes `context-lost`
  - `src/main.tsx` enables `React.StrictMode`
- conclusion:
  - this is a real implementation gap, not just stale ticket drift
  - the bug is teardown-originated context loss escaping into the next lifecycle on the same canvas

### 2026-03-27 03:35
- moved the ticket from `tickets/backlog/` to `tickets/in-progress/` and set `Status: IN_PROGRESS` per the requested audit flow
- audited the current startup-failure browser matrix and renderer runtime code instead of starting new implementation work
- findings:
  - `e2e/render-startup-failures.spec.ts` already covers null WebGL, lost-on-acquire, and unreadable GPU-limit startup failures and asserts the runtime message, failure reason, active backend, diagnostics context availability, and Canvas 2D fallback UI text
  - `GLRenderer.initialize()` deterministically validates acquired WebGL, routes invalid or unavailable startup through `initializeCanvasFallback()`, and publishes explicit diagnostics for `webgl-unavailable`, `context-acquired-lost`, `gpu-limits-unreadable`, and initialization/render failure paths
  - `RenderController` derives a single `rendererRuntime` object from diagnostics via `deriveRendererRuntimeStateFromDiagnostics()` and uses that as the source of truth for `rendererError`, `webglDiagnostics`, and context-lost/error/fallback publication
  - prior audit ticket `AUTEURA-STAB-006` already classified this ticket as satisfied in substance
- current decision:
  - this ticket appears to need reconciliation/closure rather than fresh renderer implementation unless new contradictory evidence appears

## Changed Files
- src/engine/GLRenderer.ts
- src/engine/__tests__/GLRenderer.test.ts
- tickets/done/AUTEURA-STAB-002.md

## Audit Findings
- Earlier audit conclusion revised:
  - real startup-failure fallback behavior is still deterministic and well covered
  - however, normal renderer disposal is not lifecycle-safe because it forces browser context loss and can drive a later false-positive `context-lost` runtime state on remount
  - this means the ticket now represents a real remaining stabilization gap, just narrower than the original scaffold suggested

## Validation Results
Record exact commands and results.

```bash
sed -n '1,260p' e2e/render-startup-failures.spec.ts
# result: reviewed current startup-failure matrix; it covers null-context, lost-on-acquire, and unreadable GPU-limit scenarios and asserts runtime/backend/fallback UI coherence

rg -n "RendererRuntime|runtimeReason|webgl|Canvas 2D|fallback|diagnostic|rendererRuntime" src/engine/GLRenderer.ts src/controllers/RenderController.tsx
# result: confirmed the current renderer/runtime code paths for diagnostics, fallback selection, and unified runtime publication

sed -n '1,240p' src/engine/GLRenderer.ts
sed -n '240,420p' src/engine/GLRenderer.ts
# result: confirmed deterministic startup validation and fallback selection through initializeCanvasFallback()

sed -n '140,260p' src/controllers/RenderController.tsx
sed -n '760,1005p' src/controllers/RenderController.tsx
# result: confirmed rendererRuntime is the controller source of truth and startup failures are published as coherent fallback/error states

sed -n '1,260p' tickets/review/AUTEURA-STAB-006.md
# result: confirmed prior stabilization audit already classified AUTEURA-STAB-002 as satisfied in substance

sed -n '1,140p' src/engine/GLRenderer.ts
# result: confirmed dispose() explicitly calls WEBGL_lose_context.loseContext()

sed -n '900,980p' src/controllers/RenderController.tsx
# result: confirmed webglcontextlost transitions runtime to context-lost and destroys the renderer

rg -n "loseContext|webglcontextlost|webglcontextrestored|StrictMode" src/engine/GLRenderer.ts src/controllers/RenderController.tsx src/main.tsx src/engine/__tests__/GLRenderer.test.ts
# result: confirmed the teardown path, the listener path, React.StrictMode enablement, and the existing dispose tests that currently encode the loseContext behavior

volta run npm run typecheck
# result: passed

volta run npm run lint
# result: passed

volta run npx vitest run src/engine/__tests__/GLRenderer.test.ts
# result: passed
# summary: 1 passed file, 7 passed tests

REAL_NODE_BIN=$(dirname "$(volta which npm)") && PATH="$REAL_NODE_BIN:$PATH" volta run npx playwright test e2e/render-startup-failures.spec.ts --reporter=line
# first attempt result: failed
# error: Process from config.webServer was not able to start. Exit code: 1
# classification: environment/sandbox web-server startup issue rather than a product failure

REAL_NODE_BIN=$(dirname "$(volta which npm)") && PATH="$REAL_NODE_BIN:$PATH" volta run npx playwright test e2e/render-startup-failures.spec.ts --reporter=line
# rerun with local bind permissions result: passed
# summary: 3 passed (43.4s)
```

## Blockers
If blocked, record:
- exact blocker
- exact failed command
- exact error
- whether environment provisioning was attempted
- what remains unverified

## Residual Risks
- The earlier audit trail in this ticket and in `AUTEURA-STAB-006` now needs to be understood as superseded by stricter lifecycle evidence: startup fallback behavior is still correct, but teardown semantics were over-trusted.
- If the fix removes `loseContext()`, the test surface must still prove pipeline disposal is happening so cleanup guarantees do not regress invisibly.
- This ticket does not yet include a dedicated React Strict Mode remount test. The regression proof is narrower: normal disposal no longer forces browser context loss, and the existing startup-failure browser matrix remains green.

## Final Summary
The ticket initially looked stale, but new lifecycle evidence proved a narrower real bug: `GLRenderer.dispose()` forced browser context loss, and `RenderController` correctly treated the resulting `webglcontextlost` event as a real runtime failure. Under React Strict Mode remount probing on the same canvas, teardown could therefore poison the next mount and leave the UI in `context-lost`. The fix was to remove the artificial `loseContext()` call while preserving pipeline disposal and idempotent shutdown. Focused renderer tests now prove disposal still cleans up renderer-owned resources without forcing browser context loss, and the existing startup-failure Playwright matrix remains green.
