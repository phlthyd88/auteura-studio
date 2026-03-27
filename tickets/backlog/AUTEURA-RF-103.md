# AUTEURA-RF-103 — Extract VirtualOutputCoordinator

## Metadata
- Status: NEW
- Type: refactor
- Priority: P1
- Owner: codex
- Created: YYYY-MM-DD
- Related:
- Depends on:
- Blocks:

## Problem Statement
Virtual output and bridge lifecycle are mixed into RenderController runtime orchestration.

## Why This Matters
This complicates renderer ownership and obscures failure and cleanup paths.

## Scope
Extract virtual output service lifecycle, bridge lifecycle, and delivery policy updates into a dedicated coordinator.

## Out of Scope
Do not change virtual output behavior.

## Acceptance Criteria
- [ ] Virtual output stays functional.
- [ ] RenderController no longer owns bridge internals directly.

## Constraints
Maintain current public behavior unless the ticket explicitly changes it.

## Context / Affected Areas
Virtual output service and bridge lifecycle.

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
