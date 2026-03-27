# AUTEURA-STAB-002 — Make renderer startup and failure state deterministic

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
Startup failure branches can drift between actual backend state, diagnostics, and rendered monitor behavior.

## Why This Matters
The app must publish one coherent renderer runtime state from first load through failure handling.

## Scope
Ensure failed or invalid WebGL initialization yields a deterministic runtime state and stable fallback backend selection.

## Out of Scope
Do not broaden scope into unrelated UI polish.

## Acceptance Criteria
- [ ] Failed WebGL init always yields one stable runtime state.
- [ ] Fallback backend selection is deterministic.
- [ ] No partial startup state leaves the monitor unusable.

## Constraints
Maintain current public behavior unless the ticket explicitly changes it.

## Context / Affected Areas
GLRenderer diagnostics, RenderController runtime state, startup failure branches.

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
