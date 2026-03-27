# AUTEURA-STAB-003 — Fix fallback monitor coherence and backend-text drift

## Metadata
- Status: NEW
- Type: stabilization
- Priority: P0
- Owner: codex
- Created: YYYY-MM-DD
- Related:
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
Fill this in before coding.
- Root cause:
- Symptom vs actual failure:
- Why current behavior happens:

## Architecture Check
- Existing abstractions involved:
- Existing conventions involved:
- Boundary concerns:
- Should this be local, extracted, or refactored?

## Blast Radius
- Upstream impact:
- Downstream impact:
- Regression risks:
- Adjacent systems to verify:

## Implementation Plan
- [ ] Triage the problem and confirm root cause.
- [ ] Implement the smallest robust solution.
- [ ] Run validation and document results.

## Validation Plan
List the exact commands or verification steps you expect to run.
- [ ] typecheck
- [ ] lint
- [ ] unit tests
- [ ] integration tests
- [ ] e2e tests
- [ ] build
- [ ] manual verification if needed

Commands:
```bash
# fill in exact commands
```

## Progress Log
### YYYY-MM-DD HH:MM
- status update
- findings
- decisions
- changed files

## Changed Files
- path/to/file
- path/to/file

## Validation Results
Record exact commands and results.

```bash
# command
# result
```

## Blockers
If blocked, record:
- exact blocker
- exact failed command
- exact error
- whether environment provisioning was attempted
- what remains unverified

## Residual Risks
List any remaining concerns, unrelated failures, or follow-up work.

## Final Summary
What was changed, why it is correct, and what was verified.
