# AUTEURA-112: Make browser-camera heartbeat resilient to timer throttling

- Status: `ready`
- Severity: `high`
- Release Gate: `pre_scale`
- Owner: `unassigned`
- Created: `2026-03-15`
- Updated: `2026-03-15`
- Dependencies: `none`

## Summary

The browser-camera bridge uses timer-based liveness checks that are fragile under background-tab throttling and sleep/wake cycles.

## Problem

[AuteuraVirtualOutputBridgeService.ts](../../src/services/AuteuraVirtualOutputBridgeService.ts#L268) depends on a fixed interval/timeout heartbeat with no drift tolerance or visibility-aware behavior.

## Why It Matters

The bridge can declare the host offline even when the underlying extension and pages are healthy.

## Failure Mode

- trigger: background the tab, lock the machine, or resume from sleep
- observable behavior: bridge disconnects and requires reconnection
- likely user impact: conference output interruption

## Scope

- affected files:
  - [AuteuraVirtualOutputBridgeService.ts](../../src/services/AuteuraVirtualOutputBridgeService.ts#L268)
- affected subsystems:
  - browser-camera bridge
  - page visibility handling
- out of scope:
  - extension protocol redesign unless necessary

## Acceptance Criteria

- [ ] liveness logic tolerates timer drift and background throttling
- [ ] sleep/wake does not trigger false offline state in normal cases
- [ ] disconnect state remains truthful when the host is genuinely gone

## Validation

- required automated checks:
  - throttled-timer lifecycle test
- required manual/runtime checks:
  - hidden-tab and sleep/wake smoke test
- closure evidence:
  - pending

## Change Log

- `2026-03-15`: initial ticket created from release audit
