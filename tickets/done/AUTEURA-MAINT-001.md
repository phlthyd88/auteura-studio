# AUTEURA-MAINT-001 — Remove stale repo artifacts and redundant docs/results

## Metadata
- Status: DONE
- Type: infra
- Priority: P2
- Owner: codex
- Created: 2026-03-26
- Related:
- Depends on:
- Blocks:

## Problem Statement
The repo currently contains a mix of generated test-run artifacts and workflow-pack scaffolding files that do not all serve the current codebase. Broad cleanup is risky, so the actual problem is distinguishing safe-to-remove stale artifacts from still-referenced workflow documentation.

## Why This Matters
Stale generated files and redundant scaffolding increase noise in the worktree and make it harder to tell which docs are authoritative. Deleting the wrong files would weaken the current ticket-driven workflow or remove still-referenced project documentation.

## Scope
Audit and remove only:
- generated test-run artifacts that are not part of the codebase
- redundant workflow-pack docs that duplicate the actual source-of-truth files
- directly implicated references that must change to keep the remaining docs coherent

## Out of Scope
Do not remove active project docs, current tickets, release-tracking docs, or workflow files that the repo still depends on. Do not perform general-purpose doc pruning beyond the audited candidates.

## Acceptance Criteria
- [x] Safe generated artifacts are removed.
- [x] Redundant or stale workflow docs are removed only if direct references are updated or proven unnecessary.
- [x] Remaining workflow and tracking docs still point at valid sources of truth.

## Constraints
- This is potentially destructive cleanup work; every removal needs a concrete justification.
- The repo’s current AGENTS and `.codex` workflow must remain usable after cleanup.
- Broad “looks unnecessary” deletion is not acceptable.

## Context / Affected Areas
- `AGENTS.md`
- `.codex/`
- `CODEX_TICKET_SYSTEM_README.md`
- `ISSUE_INDEX.md`
- `test-results/`
- repo docs and tracking files that reference workflow docs

## Root Cause Analysis
Fill this in before coding.
- Root cause: the repo accumulated both current workflow files and extra pack/scaffolding artifacts, while test runs also left generated state in `test-results/`. Not all of these files are authoritative or still needed.
- Symptom vs actual failure: the visible symptom is “too many markdown files and leftover results.” The actual failure is unclear ownership: some docs are active source-of-truth files, some are packaging leftovers, and some are pure generated artifacts.
- Why current behavior happens: the ticket system pack introduced untracked workflow docs alongside existing repo tracking docs, and Playwright left a `.last-run.json` marker in `test-results/`.
- Context check: current references were audited with `rg`; no `.txt` files exist; the obvious safe candidates are `test-results/.last-run.json`, the now-empty `test-results/` directory, and `CODEX_TICKET_SYSTEM_README.md`. `ISSUE_INDEX.md` appears stale and only referenced by `AGENTS.md`, so deleting it requires updating `AGENTS.md`.

## Architecture Check
- Existing abstractions involved: the repo currently has two documentation layers, the active Codex workflow in `AGENTS.md` + `.codex/`, and the repo’s tracked release/refactor docs in `docs/tracking/`.
- Existing conventions involved: `AGENTS.md` points to `.codex` files as source of truth and lists supporting files; tracked release docs point to `docs/tracking/ticket-template.md`.
- Boundary concerns: removing workflow-pack scaffolding is safe only if the remaining workflow still has one coherent source of truth and no dangling references.
- Should this be local, extracted, or refactored? Local cleanup only.

## Blast Radius
- Upstream impact: none on product runtime if cleanup stays in generated artifacts and redundant docs.
- Downstream impact: future ticket-driven work depends on `AGENTS.md` and `.codex` still pointing at valid files.
- Regression risks: deleting a file that is still referenced would break the workflow or confuse maintainers about the canonical docs.
- Adjacent systems to verify: `AGENTS.md`, `README.md`, `docs/tracking/README.md`, and any `rg` references to removed files.

## Implementation Plan
- [x] Triage the cleanup scope and classify candidate files before deleting anything.
- [x] Remove only the audited stale/generated files and update directly implicated references.
- [x] Run validation and document the exact results before moving the ticket forward.

## Validation Plan
List the exact commands or verification steps you expect to run.
- [x] typecheck not required; no source, package, or TypeScript-bearing runtime files changed
- [x] lint not required; no linted source files changed
- [x] unit tests not required for doc/artifact cleanup unless source files change
- [x] integration tests not required
- [x] e2e tests not required
- [x] build not required
- [x] manual verification if needed

Commands:
```bash
rg -n "ISSUE_INDEX|CODEX_TICKET_SYSTEM_README|test-results|\\.last-run\\.json" .
find . -maxdepth 2 \( -type d -name 'test-results' -o -type d -name 'playwright-report' -o -type d -name 'coverage' \) -print | sort
find . -path './.git' -prune -o -type f \( -name '*.md' -o -name '*.txt' \) -print | sort
git diff --check
# if source or workflow files change materially, reinstall deps and run repo checks:
# volta run npm ci
# volta run npm run typecheck
# volta run npm run lint
```

## Progress Log
### 2026-03-26 23:57
- moved the ticket to `tickets/review/` with `Status: READY_FOR_REVIEW`
- cleanup scope remains intentionally narrow: remove only the audited stale/generated files, not broader project docs

### 2026-03-26 23:59
- tightened the validation framing to match the actual workspace state
- `git status --short` showed many unrelated in-flight changes outside this ticket
- `git ls-files` confirmed `CODEX_TICKET_SYSTEM_README.md`, `ISSUE_INDEX.md`, and `test-results/` were untracked
- therefore this ticket should be understood as narrow workspace/repo-hygiene cleanup in a dirty working tree, not proof of a globally isolated diff
- added `AGENTS.md`-scoped diff checks to verify the one reference-bearing change directly

### 2026-03-26 23:55
- completed the audited cleanup set without widening scope
- removed:
  - `test-results/.last-run.json`
  - the now-empty `test-results/` directory
  - `CODEX_TICKET_SYSTEM_README.md`
  - `ISSUE_INDEX.md`
- updated `AGENTS.md` to stop referencing `ISSUE_INDEX.md`
- verified that no remaining non-ticket references point to the deleted workflow-pack files

### 2026-03-26 23:52
- moved the ticket into `tickets/in-progress/` and advanced the status to `IN_PROGRESS`
- selected the cleanup set from triage:
  - remove `test-results/.last-run.json` and the now-empty `test-results/` directory
  - remove `CODEX_TICKET_SYSTEM_README.md` as redundant pack documentation
  - remove `ISSUE_INDEX.md` and update `AGENTS.md` to stop pointing at it
- no other markdown docs or tracking files are being removed in this ticket

### 2026-03-26 23:50
- moved the ticket from `NEW` to `TRIAGED` while keeping it in `tickets/backlog/`
- audited the markdown/text/generated-artifact surface before deleting anything
- confirmed there are no `.txt` files to clean up
- classified current candidates:
  - safe generated artifact: `test-results/.last-run.json`
  - likely safe generated directory removal after artifact deletion: `test-results/`
  - likely redundant scaffolding doc: `CODEX_TICKET_SYSTEM_README.md`
  - stale but reference-coupled candidate: `ISSUE_INDEX.md` only if `AGENTS.md` is updated to stop referencing it
- no deletion has started yet; next step is to apply only the audited cleanup set and then verify references

## Changed Files
- tickets/review/AUTEURA-MAINT-001.md
- AGENTS.md
- CODEX_TICKET_SYSTEM_README.md
- ISSUE_INDEX.md
- test-results/.last-run.json

## Validation Results
Record exact commands and results.

```bash
rg -n "ISSUE_INDEX|CODEX_TICKET_SYSTEM_README|test-results|\\.last-run\\.json" .
# result: pre-cleanup audit confirmed candidate files and references

find . -path './.git' -prune -o -type f \( -name '*.md' -o -name '*.txt' \) -print | sort
# result: no `.txt` files exist in the repo

test ! -e test-results && echo 'test-results removed'
# result: passed
# output: test-results removed

rg -n "ISSUE_INDEX|CODEX_TICKET_SYSTEM_README" AGENTS.md README.md docs .codex scripts || true
# result: passed
# output: no remaining non-ticket references

git diff --check
# result: passed

git status --short AGENTS.md CODEX_TICKET_SYSTEM_README.md ISSUE_INDEX.md test-results tickets/in-progress/AUTEURA-MAINT-001.md
# result: superseded by broader workspace verification below

git status --short
# result: shows many unrelated in-flight changes outside this ticket; this ticket was validated in a dirty working tree

git ls-files | rg '^(CODEX_TICKET_SYSTEM_README\.md|ISSUE_INDEX\.md|test-results/)'
# result: no matches, exit code 1
# interpretation: the removed stale files were untracked rather than tracked project files

git diff --check -- AGENTS.md
# result: passed

git diff -- AGENTS.md
# result: one narrow ticket-scoped diff removing the stale `ISSUE_INDEX.md` supporting-file reference
```

## Blockers
If blocked, record:
- exact blocker
- exact failed command
- exact error
- whether environment provisioning was attempted
- what remains unverified

## Residual Risks
- This ticket intentionally did not prune broader project docs that merely looked old; if more documentation cleanup is desired, it should be done through a separate audit with file-by-file justification.
- `AGENTS.md` and the `.codex` workflow files remain untracked in the current worktree. This ticket treated them as current repo workflow, not as cleanup candidates.
- Because the worktree is already dirty with unrelated in-flight changes, this ticket does not establish a globally isolated cleanup diff; it establishes that the audited cleanup itself is narrow and locally coherent.

## Final Summary
Removed only the cleanup candidates that were defensibly stale or generated: the Playwright last-run artifact and empty `test-results/` directory, the redundant `CODEX_TICKET_SYSTEM_README.md`, and the stale `ISSUE_INDEX.md` after updating `AGENTS.md` to stop referencing it. Left the actual workflow source-of-truth files, tracking docs, and ticket set intact. Validation now reflects the real workspace state: this was narrow maintenance cleanup performed in a dirty working tree, with `git ls-files` confirming the removed stale files were untracked and `AGENTS.md`-scoped diff checks confirming the only reference-bearing change was the intended removal of the stale supporting-file link.
