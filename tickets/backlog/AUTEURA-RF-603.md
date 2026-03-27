# AUTEURA-RF-603 — Backfill missing regression tests after extraction

## Metadata
- Status: NEW
- Type: test
- Priority: P2
- Owner: codex
- Created: YYYY-MM-DD
- Related:
- Depends on:
- Blocks:

## Problem Statement
Refactor work may reveal gaps in regression coverage that were previously hidden.

## Why This Matters
Backfilling these prevents future drift.

## Scope
Add missing regression tests identified during the extraction program.

## Out of Scope
Do not duplicate tests without value.

## Acceptance Criteria
- [ ] Known gaps found during refactor are covered.
- [ ] Coverage aligns with subsystem risk.

## Constraints
Maintain current public behavior unless the ticket explicitly changes it.

## Context / Affected Areas
Post-refactor regression coverage.

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
