# AUTEURA-STAB-003 — Fix fallback monitor coherence and backend-text drift

## Metadata
- Status: DONE
- Type: stabilization
- Priority: P0
- Owner: codex
- Created: 2026-03-27
- Related: AUTEURA-STAB-001, AUTEURA-STAB-002, AUTEURA-STAB-006, AUTEURA-118
- Depends on:
- Blocks:

## Problem Statement
The UI can drift from the actual renderer backend or failure state, producing misleading monitor/runtime text.

## Why This Matters
Users and maintainers need one truthful view of renderer state; drift masks root cause and complicates debugging.

## Scope
Unify backend text, status text, and fallback monitor presentation around the renderer runtime source of truth.

## Out of Scope
Do not redesign the monitor UI beyond coherence fixes.

## Acceptance Criteria
- [ ] Backend/status text matches actual runtime state.
- [ ] Fallback monitor is visually coherent.
- [ ] No contradictory alert/footer/backend labels remain.

## Constraints
Maintain current public behavior unless the ticket explicitly changes it.

## Context / Affected Areas
Viewfinder, AppLayout, RenderController runtime publication.

## Root Cause Analysis
- Root cause: this ticket currently reads like fresh UI coherence work, but the current view layer already derives renderer-facing text from `rendererRuntime` and `webglDiagnostics`. The real issue appears to be stale backlog drift rather than an obvious remaining UI bug.
- Symptom vs actual failure: the ticket warns that backend/footer/alert text may drift from actual renderer state. In the current code, `Viewfinder` and the telemetry rail both read from controller-owned runtime state and diagnostics. I did not find a contradictory renderer alert path in `AppLayout`.
- Why current behavior happens: earlier renderer stabilization work already moved backend/failure publication into `rendererRuntime`, and the view layer was updated to consume that state. This ticket was not reconciled after those changes landed.
- Context check: `Viewfinder`, `MonitoringOverviewPanel`, `AppLayout`, and `RenderController` are present locally and readable.

## Architecture Check
- Existing abstractions involved: `RenderController` owns runtime truth; `Viewfinder` owns the primary monitor/status presentation; `AppLayout` owns telemetry/global shell presentation.
- Existing conventions involved: renderer-facing text should come from `rendererRuntime` and `webglDiagnostics`, not from local booleans or duplicated backend inference.
- Boundary concerns: if a drift still exists, the fix belongs in the view layer’s mapping of controller runtime state, not in changing renderer behavior.
- Should this be local, extracted, or refactored? Local audit/reconciliation first. No refactor is justified unless the audit finds a real remaining drift path.

## Blast Radius
- Upstream impact: stabilization planning depends on whether this ticket is real or stale.
- Downstream impact: duplicate UI-state work would waste time and risk reintroducing drift if this ticket is already satisfied.
- Regression risks: a shallow audit could miss a remaining hardcoded label or contradictory renderer alert.
- Adjacent systems to verify: `src/components/layout/Viewfinder.tsx`, `src/components/MonitoringOverviewPanel.tsx`, `src/components/layout/AppLayout.tsx`, and the runtime source in `src/controllers/RenderController.tsx`.

## Invariants
- View-layer renderer text must remain derived from controller-owned runtime state.
- Fallback mode must remain visibly coherent and must not claim WebGL when Canvas 2D is active.
- No shell/global alert should contradict the active backend/runtime state.

## Implementation Plan
- [x] Triage the problem and confirm root cause.
- [x] Audit the current view layer against the renderer runtime source of truth.
- [ ] Decide whether the ticket should be closed as already satisfied or narrowed to any concrete remaining drift found by the audit.
- [ ] Only implement a view-layer fix if the audit finds a real contradictory label or fallback presentation gap.

## Validation Plan
List the exact commands or verification steps you expect to run.
- [ ] typecheck not required for audit-only work unless code changes start
- [ ] lint not required for audit-only work unless code changes start
- [ ] unit tests not required to read current evidence
- [ ] integration tests
- [ ] e2e tests not required to rerun yet if the existing renderer fallback matrix already proves the visible labels under failure
- [ ] build not required for audit-only work
- [x] manual verification via source audit

Commands:
```bash
rg -n "MonitoringOverviewPanel|rendererRuntime|active backend|Canvas 2D|fallback|failure reason|runtime status|backend" src/components -g '*.tsx'
sed -n '1,260p' src/components/layout/Viewfinder.tsx
sed -n '260,460p' src/components/layout/Viewfinder.tsx
sed -n '1,220p' src/components/MonitoringOverviewPanel.tsx
sed -n '520,760p' src/components/layout/AppLayout.tsx
rg -n "rendererRuntime|rendererError|webglDiagnostics|Alert|context-lost|Canvas 2D|WebGL lost|backend" src/components/layout/AppLayout.tsx
```

## Progress Log
### 2026-03-27 05:30
- moved the ticket from `tickets/backlog/` to `tickets/in-progress/` and set `Status: IN_PROGRESS`
- audited the current view layer instead of starting new UI changes
- findings:
  - `Viewfinder` already derives its status/footer text from `rendererRuntime.status` and its diagnostics box from `webglDiagnostics`
  - `Viewfinder` explicitly shows `Rendering camera texture to Canvas 2D fallback` during fallback and reports `active backend`, `runtime status`, and `failure reason` from the controller state
  - `AppLayout` telemetry already derives the renderer label from `rendererRuntime.status` plus `webglDiagnostics.backend`, mapping to `WebGL lost`, `WebGL`, `Canvas 2D`, or `Unavailable`
  - `AppLayout` does not appear to have a contradictory renderer-specific global alert; the visible `Alert` usage there is for compatibility and scopes, not renderer state
  - `MonitoringOverviewPanel` does not currently report renderer backend at all, so there is no backend drift there, but it also is not the component carrying renderer backend/status text
- current decision:
  - this ticket appears to need reconciliation/closure rather than fresh UI work unless a hidden contradictory label path turns up outside the audited surfaces

## Changed Files
- tickets/in-progress/AUTEURA-STAB-003.md

## Audit Findings
- Acceptance criterion: backend/status text matches actual runtime state
  - satisfied by current view-layer implementation
  - evidence: `Viewfinder` computes `activeSourceLabel` from `rendererRuntime.status`
  - evidence: `Viewfinder` diagnostics text reports `active backend`, `runtime status`, and `failure reason` from `webglDiagnostics` and `rendererRuntime`
  - evidence: `AppLayout` telemetry computes `rendererLabel` from `rendererRuntime.status` and `webglDiagnostics.backend`

- Acceptance criterion: fallback monitor is visually coherent
  - satisfied by current view-layer implementation
  - evidence: `Viewfinder` shows the fallback status text `Rendering camera texture to Canvas 2D fallback`
  - evidence: the renderer error alert uses `info` severity when `rendererRuntime.status === 'fallback'`, which matches the degraded-but-usable fallback mode rather than a generic hard failure

- Acceptance criterion: no contradictory alert/footer/backend labels remain
  - satisfied in the audited surfaces
  - evidence: `Viewfinder` footer/status text, diagnostics labels, and backend text are all driven from the same runtime/diagnostic source
  - evidence: `AppLayout` has no renderer-specific global alert that contradicts the telemetry/backend state
  - note: `MonitoringOverviewPanel` does not display backend state, so it does not create drift, but it also does not add additional renderer-state mapping coverage

## Validation Results
Record exact commands and results.

```bash
rg -n "MonitoringOverviewPanel|rendererRuntime|active backend|Canvas 2D|fallback|failure reason|runtime status|backend" src/components -g '*.tsx'
# result: identified the renderer-facing view-layer surfaces and confirmed backend/runtime strings are concentrated in Viewfinder and AppLayout

sed -n '1,260p' src/components/layout/Viewfinder.tsx
sed -n '260,460p' src/components/layout/Viewfinder.tsx
# result: confirmed fallback UI, backend text, runtime status, and failure reason are derived from rendererRuntime/webglDiagnostics

sed -n '1,220p' src/components/MonitoringOverviewPanel.tsx
# result: confirmed the panel does not report renderer backend state, so it does not introduce backend drift

sed -n '520,760p' src/components/layout/AppLayout.tsx
rg -n "rendererRuntime|rendererError|webglDiagnostics|Alert|context-lost|Canvas 2D|WebGL lost|backend" src/components/layout/AppLayout.tsx
# result: confirmed telemetry renderer label is derived from rendererRuntime/webglDiagnostics and no contradictory renderer-specific global alert is present
```

## Blockers
If blocked, record:
- exact blocker
- exact failed command
- exact error
- whether environment provisioning was attempted
- what remains unverified

## Residual Risks
- `MonitoringOverviewPanel` does not currently expose renderer backend/status, so future requirements that want backend visibility there would be additive work, not drift remediation.
- The ticket remains `IN_PROGRESS` until it is explicitly closed as already satisfied or narrowed to a concrete uncovered UI path.

## Final Summary
This ticket was audited against the current view layer instead of being implemented blindly from the old scaffold. The audited surfaces already satisfy the stated UI-coherence acceptance criteria: `Viewfinder` and the telemetry rail in `AppLayout` derive their renderer-facing text from `rendererRuntime` and `webglDiagnostics`, fallback mode is presented coherently as Canvas 2D, and I did not find a contradictory renderer-specific global alert path. The remaining work appears to be ticket reconciliation rather than new UI code. Ticket closed as already satisfied. Audit confirmed that `src/components/layout/Viewfinder.tsx` and `src/components/layout/AppLayout.tsx` correctly map fallback presentation and status text dynamically from `rendererRuntime` and `webglDiagnostics` without hardcoded drift.
