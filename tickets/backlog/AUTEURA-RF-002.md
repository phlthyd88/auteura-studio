# AUTEURA-RF-002 — Map critical user flows to regression ownership

## Metadata
- Status: NEW
- Type: refactor
- Priority: P0
- Owner: codex
- Created: YYYY-MM-DD
- Related:
- Depends on:
- Blocks:

## Problem Statement
Refactor work needs an explicit map from critical user flows to subsystem ownership and regression responsibility.

## Why This Matters
Without this map, regressions can slip through because ownership is diffuse.

## Scope
Map recording persistence, LUT restore, portrait retouch, browser camera fallback, hidden-tab timelapse, timeline export, WebGL fallback, and large media library resilience to subsystem owners.

## Out of Scope
Do not add new product behavior.

## Acceptance Criteria
- [ ] Protected flows are mapped to subsystems.
- [ ] Each refactor PR can identify affected flows.
- [ ] Critical-path validation responsibilities are clear.

## Constraints
Maintain current public behavior unless the ticket explicitly changes it.

## Context / Affected Areas
Critical-path flows and subsystem ownership.

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
