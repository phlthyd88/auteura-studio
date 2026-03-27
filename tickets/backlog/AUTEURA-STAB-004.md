# AUTEURA-STAB-004 — Expand regression coverage for startup-failure and fallback branches

## Metadata
- Status: NEW
- Type: test
- Priority: P0
- Owner: codex
- Created: YYYY-MM-DD
- Related:
- Depends on:
- Blocks:

## Problem Statement
The existing suite does not fully prove the startup branches implicated by the observed renderer failure.

## Why This Matters
Without regression coverage, fixes can regress under HMR/startup/fallback changes.

## Scope
Add or extend tests for null webgl, null experimental-webgl, lost-on-acquire, and unreadable GPU-limit startup paths.

## Out of Scope
Do not attempt broad unrelated E2E cleanup.

## Acceptance Criteria
- [ ] The failing startup scenario is covered by automation.
- [ ] Old behavior fails and the fix passes.
- [ ] Fallback assertions verify runtime text and monitor state.

## Constraints
Maintain current public behavior unless the ticket explicitly changes it.

## Context / Affected Areas
GLRenderer tests, Playwright critical path tests.

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
