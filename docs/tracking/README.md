# Ticket Tracking System

This directory is the repo-local source of truth for reliability, release, and architecture remediation work.

Use it when:
- a release audit identifies concrete defects
- a production incident reveals a repeatable failure mode
- a risky architectural weakness needs staged hardening
- a fix needs explicit validation before it can be considered closed

## Structure

- [release-stability-board.md](release-stability-board.md): master register and release gate board
- [refactor-guardrails.md](refactor-guardrails.md): protected flows, subsystem ownership, and refactor review checklist
- [ticket-template.md](ticket-template.md): canonical ticket format
- `tickets/`: one file per active or historically important ticket

## Lifecycle

Every tracked issue must move through these states:

1. `identified`
2. `ready`
3. `in_progress`
4. `blocked`
5. `validation`
6. `done`

Use `cancelled` only if the problem is proven invalid or superseded.

## Ticket Rules

- Use ticket IDs in the form `AUTEURA-###`.
- One ticket should describe one production-relevant problem, not a mixed bag.
- Every ticket must name:
  - severity
  - owner
  - affected files or subsystems
  - production failure mode
  - acceptance criteria
  - required validation evidence
- A ticket is not `done` until the validation section contains the commands, tests, or runtime evidence used to close it.

## Severity

- `critical`: release blocker or likely data loss/crash/privacy failure
- `high`: severe stability or correctness risk that should be fixed before broad release
- `medium`: important scale, resilience, or integrity issue
- `low`: worthwhile cleanup or future hardening

## Release Gate

The board distinguishes:
- `release_blocker`
- `pre_scale`
- `post_release`

Only tickets marked `release_blocker` can block an RC or production tag by default.

## Workflow

1. Add or update the ticket file in `tickets/`.
2. Add the ticket to the board with current status and target gate.
3. Reference the ticket ID in commits and PRs.
4. Move the ticket to `validation` only when the code change is complete.
5. Move the ticket to `done` only after evidence is recorded.

Controller or shell extraction work must also update [refactor-guardrails.md](refactor-guardrails.md) when protected-flow ownership or review expectations change.
