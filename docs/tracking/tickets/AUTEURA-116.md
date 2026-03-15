# AUTEURA-116: Persist and resurface update-ready state

- Status: `done`
- Severity: `medium`
- Release Gate: `pre_scale`
- Owner: `unassigned`
- Created: `2026-03-15`
- Updated: `2026-03-15`
- Dependencies: `none`

## Summary

An available app update can be dismissed for the rest of a long-running session.

## Problem

[PwaUpdatePrompt.tsx](../../src/components/PwaUpdatePrompt.tsx#L57) allows the user to dismiss the prompt without a persistent reminder or stronger stale-build warning.

## Why It Matters

Long-lived tabs can keep operating on outdated code after a newer service worker is waiting.

## Acceptance Criteria

- [x] update-ready state survives prompt dismissal
- [x] users are reminded again before long-lived stale sessions continue too far
- [x] update prompts still respect active recording/capture safety constraints

## Validation

- required automated checks:
  - service worker update UI state test
- closure evidence:
  - `npm run typecheck`
  - `vitest run src/components/__tests__/PwaUpdatePrompt.test.tsx`

## Change Log

- `2026-03-15`: initial ticket created from release audit
- `2026-03-15`: added persistent update-ready reminder coverage and closed the ticket
