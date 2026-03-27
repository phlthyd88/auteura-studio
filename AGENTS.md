#!/usr/bin/env bash# AGENTS.md

## Purpose

This repository uses a ticket-driven engineering workflow for all non-trivial work.

The goal is not to make a local issue disappear as quickly as possible.
The goal is to solve the correct problem in a way that preserves or improves:

- correctness
- maintainability
- architectural integrity
- code clarity
- reliability
- future developer experience

Act like the future maintainer of this codebase.

---

## Source of Truth

Read and obey these files, in order:

1. `.codex/CODEX_TICKET_SYSTEM.md`
2. `.codex/TICKET_WORKFLOW.md`
3. `.codex/REVIEW_CHECKLIST.md`

Use these supporting files as needed:

- `.codex/TICKET_TEMPLATE.md`
- `tickets/`

If instructions conflict, prefer the stricter engineering rule unless the user explicitly directs otherwise.

---

## Core Operating Rules

### Ticket-first rule

Do not do non-trivial work from a vague prompt alone.

Every non-trivial task must be tied to a ticket file in `tickets/`.

You must:
- select an existing ticket, or create a new one
- triage it before coding
- keep it updated while working
- validate before marking it complete
- keep workflow folder and ticket status aligned

### Engineering rule

Do not:
- do happy-path-only coding
- use lazy shortcuts, bandaids, hacks, placeholders, stubs, fake implementations, or TODO evasions unless explicitly requested and clearly labeled
- patch symptoms while ignoring root cause
- ignore adjacent code-quality problems that are directly implicated by the task
- invent missing APIs, files, types, runtime assumptions, or infrastructure
- claim completion without validation
- overstate confidence
- use vague reassurance instead of technical reporting

### Adjacent integrity rule

If solving the task correctly requires touching nearby code, interfaces, validation, tests, or abstractions, do so.

Do not use “outside scope” as an excuse to leave correctness or maintainability issues in directly implicated code paths.

Keep changes disciplined and relevant. Do not widen scope into unrelated cleanup.

### Pushback rule

If a requested approach would:
- introduce technical debt
- violate architecture
- create brittleness
- solve the wrong problem
- weaken maintainability or correctness

do not follow it blindly.

Document:
1. **The Flaw** — why the requested approach is technically unsound
2. **The Blast Radius** — what would be harmed
3. **The Correct Path** — the robust alternative you will use

Push back with technical clarity, not attitude.

---

## Ticket Workflow Model

### Ticket folders are workflow buckets

Valid ticket folders:
- `tickets/backlog/`
- `tickets/in-progress/`
- `tickets/blocked/`
- `tickets/review/`
- `tickets/done/`

### Status fields are finer-grained state

Valid statuses:
- `NEW`
- `TRIAGED`
- `IN_PROGRESS`
- `BLOCKED`
- `READY_FOR_REVIEW`
- `DONE`

### Allowed folder-to-status mapping

- `tickets/backlog/` -> `NEW` or `TRIAGED`
- `tickets/in-progress/` -> `IN_PROGRESS`
- `tickets/blocked/` -> `BLOCKED`
- `tickets/review/` -> `READY_FOR_REVIEW`
- `tickets/done/` -> `DONE`

A ticket may be triaged while still in `tickets/backlog/`.
Once actual implementation begins, move it to `tickets/in-progress/` and set `Status: IN_PROGRESS`.

The folder location and the `Status:` field must always be compatible.

---

## Required Pre-Code Analysis

Before implementing any non-trivial change, document in the ticket:

### Root Cause
What is actually wrong?

### Context Check
Do you have all required files, types, interfaces, assumptions, runtime constraints, and dependencies?

### Architecture Check
What abstraction boundaries, subsystem rules, and conventions apply here?

### Blast Radius
What upstream and downstream code, services, tests, or runtime behavior may be affected?

### Invariants
What must remain true after the change?

### Validation Plan
How will the fix be proven?

If required context is missing, retrieve it. Do not guess.

Do not start coding until the ticket is at least meaningfully triaged.

---

## Required Ticket Sections

Before active implementation, the ticket should have meaningful content for:

- Problem Statement
- Why This Matters
- Scope
- Out of Scope
- Acceptance Criteria
- Constraints
- Context / Affected Areas
- Root Cause Analysis
- Architecture Check
- Blast Radius
- Implementation Plan
- Validation Plan

While working, keep these sections current:

- Progress Log
- Changed Files
- Validation Results
- Blockers
- Residual Risks
- Final Summary

---

## Ticket Operations

### Preferred way to create tickets

Use:

```bash
scripts/new-ticket.sh <TICKET_ID> "<TITLE>"
