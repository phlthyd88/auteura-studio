# AUTEURA-RF-205 — Preserve AI critical flows during extraction

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
AI refactor work must not break portrait retouch, scene insights, or visibility-aware behavior.

## Why This Matters
These are user-visible runtime capabilities and regression-sensitive flows.

## Scope
Validate AI-related critical flows during and after extraction.

## Out of Scope
Do not use manual spot checks as the only proof.

## Acceptance Criteria
- [ ] Portrait retouch flow remains functional.
- [ ] Scene insight flow remains functional.
- [ ] Visibility-aware behavior remains intact.

## Constraints
Maintain current public behavior unless the ticket explicitly changes it.

## Context / Affected Areas
AI critical-path validation.

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
