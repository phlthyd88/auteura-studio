# AUTEURA-RF-307 — Preserve capture and media-library critical flows

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
Capture and storage refactor work must not break recording persistence, timelapse, download/delete, or large library behavior.

## Why This Matters
These flows are operationally central and regression-sensitive.

## Scope
Validate core capture and media-library flows during and after extraction.

## Out of Scope
Do not rely on source-level review alone.

## Acceptance Criteria
- [ ] Record to reload persistence still works.
- [ ] Download and delete still work.
- [ ] Hidden-tab timelapse behavior remains correct.
- [ ] Large media library resilience remains intact.

## Constraints
Maintain current public behavior unless the ticket explicitly changes it.

## Context / Affected Areas
Capture and media library critical-path validation.

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
