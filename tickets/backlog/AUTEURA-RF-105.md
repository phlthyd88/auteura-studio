# AUTEURA-RF-105 — Thin RenderController to facade/orchestrator

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
After render extractions, RenderController should become a wiring and state-publication layer rather than a runtime monolith.

## Why This Matters
This is the main maintainability objective of the render refactor.

## Scope
Reduce RenderController to service wiring, React-facing commands, and state publication.

## Out of Scope
Do not remove public controller outputs without an explicit contract change.

## Acceptance Criteria
- [ ] Low-level runtime logic is extracted.
- [ ] File complexity is materially reduced.
- [ ] Controller facade remains stable.

## Constraints
Maintain current public behavior unless the ticket explicitly changes it.

## Context / Affected Areas
RenderController facade responsibilities.

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
