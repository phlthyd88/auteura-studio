# AUTEURA-RF-002 — Map critical user flows to regression ownership

## Metadata
- Status: DONE
- Type: refactor
- Priority: P0
- Owner: codex
- Created: 2026-03-27
- Related: AUTEURA-118
- Depends on:
- Blocks:

## Problem Statement
This ticket asks for an explicit map from critical user flows to subsystem ownership and regression responsibility. The current repo may already contain that mapping under the refactor guardrail work, so the first task is to reconcile the backlog ticket against the existing docs instead of reimplementing documentation blindly.

## Why This Matters
Without an explicit protected-flow map, controller extraction work can diffuse ownership and allow regressions to slip through. If the mapping already exists, the real problem is stale backlog state rather than missing implementation.

## Scope
Audit whether the following flows are already mapped to facade owners, supporting subsystems, and regression responsibilities:

- recording persistence
- LUT restore
- portrait retouch
- browser camera fallback
- hidden-tab timelapse
- timeline export
- WebGL fallback
- large media library resilience

Determine whether this ticket needs a new mapping document, a targeted update to an existing one, or closure as already satisfied/superseded.

## Out of Scope
Do not add new product behavior or perform unrelated refactor implementation.

## Acceptance Criteria
- [x] Protected flows are mapped to subsystems or any missing mapping is identified precisely.
- [x] The audit determines whether refactor PRs can already identify affected flows from existing docs.
- [x] The audit determines whether validation responsibilities are already clear or documents the exact gaps.

## Constraints
Keep this ticket limited to documentation/tracking reconciliation. Do not reopen already-completed guardrail work without evidence of a real gap.

## Context / Affected Areas
- `docs/tracking/refactor-guardrails.md`
- `docs/architecture/controller-facades.md`
- `docs/tracking/release-stability-board.md`
- `docs/tracking/tickets/AUTEURA-118.md`
- backlog ticket `AUTEURA-RF-002`

## Root Cause Analysis
- Root cause: this backlog ticket drifted behind existing guardrail work. The repo already contains a protected-flow ownership map in `docs/tracking/refactor-guardrails.md`, plus facade owner contracts in `docs/architecture/controller-facades.md`, and the release board records that guardrail tranche as `AUTEURA-118` done.
- Symptom vs actual failure: the visible symptom is a `NEW` P0 backlog ticket asking for ownership mapping. The actual issue is stale ticket state rather than missing mapping documentation.
- Why current behavior happens: `AUTEURA-RF-002` was not reconciled after the guardrail tranche landed, so the backlog still describes work that is already substantially or completely satisfied by the current docs.

## Architecture Check
- Existing abstractions involved: controller facades are the public ownership boundary; `refactor-guardrails.md` is the protected-flow ownership map; the release board tracks completion of the guardrail tranche.
- Existing conventions involved: refactor ownership and regression responsibilities are documented in tracking/architecture docs rather than in code comments or ad hoc PR descriptions.
- Boundary concerns: any update should land in the existing mapping document instead of creating a parallel source of truth unless a real missing flow is found.
- Should this be local, extracted, or refactored? Reconciliation only; no code or architecture refactor.

## Blast Radius
- Upstream impact: none on runtime behavior.
- Downstream impact: stale backlog tickets can waste refactor effort or cause duplicate documentation.
- Regression risks: creating a second mapping document would split ownership truth and weaken the guardrail process.
- Adjacent systems to verify: controller facade docs, refactor guardrail checklist, and release-board ticket history.

## Implementation Plan
- [x] Triage the problem and confirm whether the repo already contains the requested mapping.
- [x] Audit the existing guardrail and facade docs against each scoped flow.
- [x] Document whether this ticket is satisfied, partially missing, or superseded.

## Validation Plan
List the exact commands or verification steps you expect to run.
- [ ] typecheck
- [ ] lint
- [ ] unit tests
- [ ] integration tests
- [ ] e2e tests
- [ ] build
- [x] manual verification if needed

Commands:
```bash
sed -n '1,260p' docs/tracking/refactor-guardrails.md
sed -n '1,260p' docs/architecture/controller-facades.md
sed -n '1,220p' docs/tracking/release-stability-board.md
sed -n '1,220p' docs/tracking/tickets/AUTEURA-118.md
```

## Progress Log
### 2026-03-27 04:39
- moved the ticket into `tickets/in-progress/` and set `Created: 2026-03-27`
- audited the existing guardrail and facade docs instead of treating the ticket as blank implementation work
- findings by scoped flow:
  - recording persistence: already mapped in `refactor-guardrails.md` as `recording persistence across reload plus download/delete` with primary owner `useRecordingController` and supporting subsystems `MediaStorageService`, `AudioContext`
  - LUT restore: already mapped in `refactor-guardrails.md` as `LUT import plus look preset restore` with primary owner `useRenderController` and supporting subsystems `LutService`, `LookPresetStorageService`
  - portrait retouch: already mapped in `refactor-guardrails.md` as `portrait retouch plus scene insight apply` with primary owners `useAIController` and `useRenderController`
  - browser camera fallback: already mapped in `refactor-guardrails.md` as `browser camera fallback workflow` with primary owner `useRenderController`
  - hidden-tab timelapse: already mapped in `refactor-guardrails.md` as `hidden-tab timelapse pause and resume` with primary owner `useRecordingController`
  - timeline export: already mapped in `refactor-guardrails.md` in two rows, `project package export` and `WebM timeline export and persisted reload`, both owned by `useTimelineController`
  - WebGL fallback: already mapped in `refactor-guardrails.md` as `WebGL startup fallback` with primary owner `useRenderController`
  - large media library resilience: already mapped in `refactor-guardrails.md` as `large metadata-heavy library load` with primary owner `useRecordingController`
- supporting evidence:
  - `controller-facades.md` defines the stable facade ownership boundaries for `useRenderController`, `useAIController`, `useRecordingController`, and `useTimelineController`
  - `release-stability-board.md` records `AUTEURA-118` (`Establish controller refactor guardrails before extraction`) as `done`
- decision:
  - no new mapping document is needed
  - no substantive mapping update is required for the flows named in this ticket
  - this ticket appears already satisfied by the guardrail tranche and should be closed as superseded/reconciled rather than implemented as new work

## Changed Files
- tickets/in-progress/AUTEURA-RF-002.md

## Validation Results
Record exact commands and results.

```bash
sed -n '1,260p' docs/tracking/refactor-guardrails.md
# result: existing protected-flow map already covers every flow named in this ticket's scope

sed -n '1,260p' docs/architecture/controller-facades.md
# result: facade ownership boundaries for render, AI, recording, and timeline are already documented and align with the protected-flow map

sed -n '1,220p' docs/tracking/release-stability-board.md
# result: AUTEURA-118 guardrail tranche is already marked done
```

## Blockers
If blocked, record:
- exact blocker
- exact failed command
- exact error
- whether environment provisioning was attempted
- what remains unverified

## Residual Risks
- The only remaining risk is process drift: other backlog tickets adjacent to the guardrail tranche may also need reconciliation against the already-landed docs before implementation starts.

## Final Summary
Audited `AUTEURA-RF-002` against the current guardrail docs and found that the ticket's scoped flows are already explicitly mapped in `docs/tracking/refactor-guardrails.md`, with facade ownership reinforced by `docs/architecture/controller-facades.md` and completion of the guardrail tranche recorded as `AUTEURA-118` on the release board. No new mapping document is needed, and no substantive documentation gap was found for the named flows. This ticket should be closed as already satisfied/superseded after review rather than implemented as fresh work.
Ticket closed as superseded. Audit confirmed that all scoped critical flows were already mapped to subsystem owners in `docs/tracking/refactor-guardrails.md` during the execution of AUTEURA-118.
