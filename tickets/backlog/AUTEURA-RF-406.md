# AUTEURA-RF-406 — Preserve timeline critical flows

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
Timeline refactor work must not break playback, package export/import, or WebM export flows.

## Why This Matters
These are core editing and output workflows and regression-sensitive.

## Scope
Validate timeline critical flows during and after extraction.

## Out of Scope
Do not treat manual spot checks as sufficient.

## Acceptance Criteria
- [ ] Manifest and package export still work.
- [ ] WebM export still persists and reloads correctly.
- [ ] Playback behaves correctly across supported modes.

## Constraints
Maintain current public behavior unless the ticket explicitly changes it.

## Context / Affected Areas
Timeline critical-path validation.

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
