# AUTEURA-MAINT-004 — Fix RecorderPanel assertNever lint failure

## Metadata
- Status: DONE
- Type: bug
- Priority: P1
- Owner: codex
- Created: 2026-03-27
- Related:
- Depends on:
- Blocks:

## Problem Statement
`volta run npm run lint` currently fails in `src/components/RecorderPanel.tsx` because the local `assertNever` helper interpolates a `never`-typed value into a template literal, which violates `@typescript-eslint/restrict-template-expressions`.

## Why This Matters
This blocks merge readiness for the current PR branch even though the runtime behavior is otherwise correct. The fix must preserve the existing exhaustiveness-check pattern without widening scope into unrelated UI or controller work.

## Scope
- Fix the `assertNever` helper in `src/components/RecorderPanel.tsx` so it remains exhaustive but no longer violates the lint rule.
- Run the exact required validation commands: `volta run npm run typecheck` and `volta run npm run lint`.
- Update this ticket with the code change and validation outcome.

## Out of Scope
Do not refactor `RecorderPanel`, change timelapse behavior, touch unrelated tests, or widen this into broader lint cleanup.

## Acceptance Criteria
- [x] The `assertNever` helper remains an exhaustiveness guard.
- [x] `RecorderPanel.tsx` no longer fails `@typescript-eslint/restrict-template-expressions`.
- [x] `volta run npm run typecheck` and `volta run npm run lint` both pass.

## Constraints
- Keep scope limited to the lint failure in `RecorderPanel.tsx`.
- Preserve type safety and exhaustiveness behavior.
- Prefer the smallest local fix that removes the lint error without changing user-facing behavior.

## Context / Affected Areas
- `src/components/RecorderPanel.tsx`
- current PR branch `feat/render-stabilization-and-ticket-governance`
- lint command `volta run npm run lint`
- typecheck command `volta run npm run typecheck`

## Root Cause Analysis
- Root cause: `assertNever(value: never)` throws `new Error(\`Unhandled timelapse state: ${value}\`)`, and the lint rule rejects interpolating a `never`-typed expression into a template literal.
- Symptom vs actual failure: the visible symptom is a lint error on line 44 of `RecorderPanel.tsx`. The actual failure is not a runtime bug but a static-analysis violation caused by the error-message construction.
- Why current behavior happens: the helper was written to include the unhandled value in the message, but because the argument is deliberately typed as `never`, the lint rule treats that interpolation as invalid even though the function is used only for exhaustiveness.

## Architecture Check
- Existing abstractions involved: local UI helper functions in `RecorderPanel`; the `TimelapseSessionState` switch exhaustiveness pattern.
- Existing conventions involved: exhaustive `switch` + `assertNever` guards are already used elsewhere in the codebase.
- Boundary concerns: the fix should stay local to the helper implementation and must not weaken the type signature from `never`.
- Should this be local, extracted, or refactored? Local fix only.

## Blast Radius
- Upstream impact: none.
- Downstream impact: lint cleanliness for the current PR branch.
- Regression risks: weakening `assertNever` too far could reduce compile-time exhaustiveness, so the function signature should remain `never`.
- Adjacent systems to verify: `typecheck` and `lint`.

## Implementation Plan
- [x] Triage the lint failure and confirm the local fix shape.
- [x] Update `assertNever` so it preserves exhaustiveness without interpolating the `never` value.
- [x] Run `typecheck` and `lint`, then document exact results.

## Validation Plan
List the exact commands or verification steps you expect to run.
- [x] typecheck
- [x] lint
- [ ] unit tests
- [ ] integration tests
- [ ] e2e tests
- [ ] build
- [ ] manual verification if needed

Commands:
```bash
volta run npm run typecheck
volta run npm run lint
```

## Progress Log
### 2026-03-27 04:29
- moved the ticket into `tickets/in-progress/` and advanced the status to `IN_PROGRESS`
- confirmed the CI/overseer suggestion to rewrite the rendered status ternary would solve the wrong problem: `RecorderPanel` already handles `'stopping'` explicitly, and the actual lint error comes from the local `assertNever` helper's template literal
- applied the smallest local fix in `src/components/RecorderPanel.tsx`:
  - changed `assertNever(value: never)` to `assertNever(_value: never)`
  - replaced the interpolated error message with a static one: `new Error('Unhandled timelapse state.')`
- first validation attempt exposed one adjacent TypeScript issue from the same helper:
  - command: `volta run npm run typecheck`
  - result: failed
  - exact error: `src/components/RecorderPanel.tsx(43,22): error TS6133: 'value' is declared but its value is never read.`
- resolved that by renaming the parameter to `_value`, which preserves the `never` exhaustiveness signature while satisfying the unused-parameter rule
- reran the required validation commands and both passed

### 2026-03-27 04:28
- created a new narrow review-fix ticket for the current PR branch because no existing maintenance ticket covered the `RecorderPanel.tsx` lint failure
- triaged the issue in `tickets/backlog/` before coding
- confirmed the failure is local to the `assertNever` helper and does not require broader UI or timelapse refactoring

## Changed Files
- tickets/in-progress/AUTEURA-MAINT-004.md
- src/components/RecorderPanel.tsx

## Validation Results
Record exact commands and results.

```bash
volta run npm run typecheck
# first result: failed
# error: src/components/RecorderPanel.tsx(43,22): error TS6133: 'value' is declared but its value is never read.

volta run npm run typecheck
# rerun result: passed

volta run npm run lint
# result: passed
```

## Blockers
If blocked, record:
- exact blocker
- exact failed command
- exact error
- whether environment provisioning was attempted
- what remains unverified

No current blockers.

## Residual Risks
- This ticket intentionally does not touch broader `RecorderPanel` rendering logic because the lint failure was isolated to the local exhaustiveness helper.

## Final Summary
Fixed the merge-blocking lint failure in `src/components/RecorderPanel.tsx` without widening scope. The root cause was the local `assertNever(value: never)` helper interpolating a `never`-typed value into a template literal, which violated `@typescript-eslint/restrict-template-expressions`. The fix keeps the helper exhaustive and type-safe by preserving the `never` parameter, renaming it to `_value` so it is intentionally unused, and changing the thrown message to a static string. Validation is green for both `volta run npm run typecheck` and `volta run npm run lint`, so the branch is clean enough to continue PR review.
