# AUTEURA-RF-504 — Extract TelemetrySelectors

## Metadata
- Status: NEW
- Type: refactor
- Priority: P2
- Owner: codex
- Created: YYYY-MM-DD
- Related:
- Depends on:
- Blocks:

## Problem Statement
Derived runtime values are computed directly inside JSX-heavy shell code.

## Why This Matters
Telemetry derivation should be testable and easier to reason about than inline JSX logic.

## Scope
Move backend labels, scope state, pipeline summaries, preview/source summaries, scene coverage, and runtime metrics into selectors or helpers.

## Out of Scope
Do not change telemetry meaning.

## Acceptance Criteria
- [ ] Telemetry selectors are isolated.
- [ ] Telemetry values remain truthful and consistent.

## Constraints
Maintain current public behavior unless the ticket explicitly changes it.

## Context / Affected Areas
Telemetry derivation logic.

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
