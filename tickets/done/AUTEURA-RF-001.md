# AUTEURA-RF-001 — Define stable controller facade contracts

## Metadata
- Status: DONE
- Type: refactor
- Priority: P0
- Owner: codex
- Created: 2026-03-26
- Related: AUTEURA-118
- Depends on:
- Blocks:

## Problem Statement
The controller-facade contract work is a prerequisite for safe controller extraction, but this backlog ticket was never reconciled after the underlying guardrail work landed elsewhere in the repo.

## Why This Matters
If this ticket is treated as still undone, maintainers can either re-implement an already-solved contract layer or misread the refactor baseline and extract controllers without a clear source of truth.

## Scope
Verify whether stable contracts for `useRenderController`, `useAIController`, `useRecordingController`, and `useTimelineController` already exist, reconcile this ticket with the actual source-of-truth artifacts, and only add missing contract documentation if a real gap remains.

## Out of Scope
Do not perform controller extraction or invent a second facade-contract source of truth.

## Acceptance Criteria
- [x] Facade contracts are documented.
- [x] Non-breaking output shape is explicit.
- [x] Future refactor tickets reference these contracts.

## Constraints
Maintain current public behavior unless the ticket explicitly changes it.

## Context / Affected Areas
Controller facade surfaces, refactor guardrail docs, and controller characterization coverage.

## Root Cause Analysis
- Root cause: this backlog ticket is stale. Its intended deliverables already appear to exist in `docs/architecture/controller-facades.md`, `docs/tracking/refactor-guardrails.md`, `CONTRIBUTING.md`, and `src/controllers/__tests__/RenderController.test.tsx`, implemented under `AUTEURA-118`.
- Symptom vs actual failure: the visible symptom is that `AUTEURA-RF-001` is still `NEW` in backlog. The actual failure is tracking drift between the backlog plan and the work that was already completed under a different ticket.
- Why current behavior happens: the refactor scaffold tickets were created before the guardrail tranche landed, and the backlog ticket was never reconciled or closed after the repo gained the contract docs and characterization coverage.
- Context check: the relevant docs, tests, and contribution rules are present locally and readable; no missing files or interfaces are blocking triage.

## Architecture Check
- Existing abstractions involved: the public controller facades are the exported hooks plus their context-value interfaces in `src/controllers`; repo-level guardrails live in `docs/architecture/controller-facades.md`, `docs/tracking/refactor-guardrails.md`, and `CONTRIBUTING.md`.
- Existing conventions involved: preserve hook names and public field semantics during extraction, keep new services behind the existing facades, and add characterization coverage before relying solely on E2E.
- Boundary concerns: blindly re-implementing this ticket would create duplicate contract docs and split the source of truth.
- Should this be local, extracted, or refactored? Local reconciliation first. Only add documentation if triage proves a real missing contract artifact.

## Blast Radius
- Upstream impact: refactor planning and ticket sequencing depend on whether this prerequisite is actually complete.
- Downstream impact: future extraction tickets and reviewers need one clear facade-contract source of truth, not overlapping docs.
- Regression risks: duplicating or editing contract docs unnecessarily could create drift between the documented facade and the actual controller interfaces.
- Adjacent systems to verify: `docs/architecture/controller-facades.md`, `docs/tracking/refactor-guardrails.md`, `CONTRIBUTING.md`, and `src/controllers/__tests__/RenderController.test.tsx`.

## Invariants
- `docs/architecture/controller-facades.md` remains the contract source of truth unless an approved ticket intentionally changes that structure.
- Refactor guardrails stay attached to the existing controller facades; no new public runtime internals should be introduced through this ticket.
- Ticket reconciliation must not claim missing work if the acceptance criteria are already satisfied by existing repo artifacts.

## Implementation Plan
- [x] Triage the problem and confirm root cause.
- [x] Reconcile the ticket against existing guardrail artifacts and only add missing documentation if triage proves a gap.
- [x] Run targeted validation and document results before moving the ticket forward.

## Validation Plan
List the exact commands or verification steps you expect to run.
- [x] typecheck
- [x] lint
- [x] unit tests
- [x] integration tests not required for ticket-only reconciliation
- [x] e2e tests not required for ticket-only reconciliation
- [x] build not required for ticket-only reconciliation
- [x] manual verification if needed

Commands:
```bash
volta run npm run typecheck
volta run npm run lint
volta run npx vitest run src/controllers/__tests__/RenderController.test.tsx
# plus direct inspection of:
# - docs/architecture/controller-facades.md
# - docs/tracking/refactor-guardrails.md
# - CONTRIBUTING.md
```

## Progress Log
### 2026-03-26 23:21
- moved the ticket to `tickets/review/` with `Status: READY_FOR_REVIEW`
- review focus is now whether the backlog reconciliation is correct and whether any neighboring scaffold tickets also need duplicate/superseded cleanup

### 2026-03-26 23:19
- validated the existing contract/guardrail artifacts instead of adding duplicate docs
- confirmed the acceptance criteria are already satisfied by:
  - `docs/architecture/controller-facades.md` for controller contract source of truth
  - `docs/tracking/refactor-guardrails.md` and `CONTRIBUTING.md` for future refactor references and review requirements
  - `src/controllers/__tests__/RenderController.test.tsx` for the current characterization seam
- no repo code or doc changes were required beyond reconciling this stale ticket with the work already completed under `AUTEURA-118`

### 2026-03-26 23:04
- moved the ticket into `tickets/in-progress/` and advanced the status to `IN_PROGRESS`
- selected the implementation path: reconcile this stale backlog ticket against the already-landed guardrail artifacts instead of duplicating controller-contract docs
- no product-code changes are planned unless validation uncovers a real gap in the existing facade-contract documentation or characterization coverage

### 2026-03-26 23:02
- moved the ticket from `NEW` to `TRIAGED` while keeping it in `tickets/backlog/`
- confirmed the likely root cause is backlog drift rather than missing facade-contract work
- found existing artifacts that already appear to satisfy the intended deliverable:
  - `docs/architecture/controller-facades.md`
  - `docs/tracking/refactor-guardrails.md`
  - `CONTRIBUTING.md`
  - `src/controllers/__tests__/RenderController.test.tsx`
- no implementation has started yet; next step is to reconcile the ticket against those artifacts before deciding whether any repo changes are actually warranted

## Changed Files
- tickets/review/AUTEURA-RF-001.md

## Validation Results
Record exact commands and results.

```bash
volta run npm run typecheck
# result: passed

volta run npm run lint
# result: passed

volta run npx vitest run src/controllers/__tests__/RenderController.test.tsx
# result: passed
# summary: 1 passed file, 3 passed tests
```

Manual verification:
- inspected `docs/architecture/controller-facades.md` and confirmed it documents the stable public contracts for `useRenderController`, `useAIController`, `useRecordingController`, and `useTimelineController`
- inspected `docs/tracking/refactor-guardrails.md` and confirmed future refactor work is required to preserve or explicitly declare controller-contract changes against that document
- inspected `CONTRIBUTING.md` and confirmed the refactor PR process points contributors to the facade-contract source of truth and protected-flow guardrails

## Blockers
If blocked, record:
- exact blocker
- exact failed command
- exact error
- whether environment provisioning was attempted
- what remains unverified

## Residual Risks
- This ticket exposed backlog drift: `AUTEURA-RF-001` was left in `NEW` even though its intended deliverable had already landed under `AUTEURA-118`.
- Neighboring backlog tickets in the same refactor scaffold may need similar reconciliation if they were superseded by the guardrail tranche rather than actually left undone.

## Final Summary
Reconciled this stale backlog ticket with the controller-facade guardrail work that already exists in the repo. The stable controller contracts are already documented in `docs/architecture/controller-facades.md`, the future refactor review requirements already reference those contracts through `docs/tracking/refactor-guardrails.md` and `CONTRIBUTING.md`, and the current extraction seam already has characterization coverage in `src/controllers/__tests__/RenderController.test.tsx`. No new product-code or facade-doc changes were required; the correct fix was to update the ticket so it matches the real state of the codebase and validation evidence.
