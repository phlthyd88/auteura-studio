# AUTEURA-MAINT-006 — Fix canvas-capture virtual output track freezing in Chrome

## Metadata
- Status: READY_FOR_REVIEW
- Type: bug
- Priority: P1
- Owner: codex
- Created: 2026-03-27
- Related: AUTEURA-RF-103, docs/browser-camera-compatibility-matrix.md
- Depends on:
- Blocks:

## Problem Statement
Chrome can freeze browser-camera output after one frame when virtual-output video tracks are cloned from a canvas-captured stream. The browser-camera handshake succeeds and the consumer sees an initial frame, but the leased cloned video track detaches from the canvas render cycle and never advances again.

## Why This Matters
This breaks the primary Google Meet browser-camera path: the synthetic camera appears to work, then immediately freezes. It is a correctness and reliability issue in a protected flow, and it also exposes ambiguous track-ownership semantics in the virtual-output service.

## Scope
- Fix the leased browser-camera video-track path so client streams use non-cloned canvas-capture video.
- Preserve correct teardown semantics so disconnecting one client does not stop shared or service-owned tracks for other consumers.
- Keep the change local to `AuteuraVirtualOutputService` and directly implicated tests.

## Out of Scope
- Do not refactor the bridge protocol or broader virtual-output coordinator architecture.
- Do not change unrelated renderer, recording, or shell code.
- Do not claim full manual Chrome/Meet signoff beyond what the current automated test surface can prove.

## Acceptance Criteria
- [x] Browser-camera leased video streams are created from direct canvas-capture tracks, not cloned canvas-capture tracks.
- [x] Releasing one client does not stop tracks owned by the service or by other clients.
- [x] Existing virtual-output refresh/teardown behavior remains coherent in the targeted unit-test surface.

## Constraints
- Keep scope limited to the virtual-output service and focused tests.
- Preserve current public API shape unless a directly implicated contract needs tightening.
- Be explicit about remaining manual-verification gaps for real Chrome/Meet behavior.

## Context / Affected Areas
- `src/services/AuteuraVirtualOutputService.ts`
- `src/services/AuteuraVirtualOutputBridgeService.ts`
- `src/services/__tests__/AuteuraVirtualOutputService.test.ts`
- `src/services/__tests__/AuteuraVirtualOutputBridgeService.test.ts`
- `docs/browser-camera-compatibility-matrix.md`

## Root Cause Analysis
Fill this in before coding.
- Root cause: the virtual-output service clones video tracks derived from `canvas.captureStream()` twice in the browser-camera path: once when building the master output stream and again when leasing client streams. In Chrome, cloned canvas-capture video tracks can present one frame and then freeze permanently.
- Symptom vs actual failure: the visible symptom is “Meet recognizes the camera and shows one frame, then freezes.” The actual failure is a track-lifecycle bug: the service is leasing cloned canvas-capture video tracks instead of a live direct canvas-capture video track.
- Why current behavior happens: `replaceVideoTracks()` clones the canvas source video into `outputStream`, and `createClientOutputStream()` clones again from `outputStream`. `releaseClientOutputStream()` then assumes client tracks are independently owned and stops them on release.
- Context check: the service, bridge, and focused tests are present locally. Existing unit tests already encode an additional contract that leased streams survive delivery-policy refresh, which means a naive “share one master track with every client” fix would silently regress refresh behavior.

## Pushback Protocol
### The Flaw
Blindly sharing the single master canvas track with every leased client would fix the Chrome clone freeze, but it would also couple all active clients to the master track replacement path in `updateCanvas()` / `setDeliveryPolicy()`.

### The Blast Radius
When the master track is refreshed, every active client would lose video because the bridge does not replace tracks inside existing peer sessions. That would regress the current service behavior encoded by the delivery-policy/leased-stream test surface.

### The Correct Path
Use direct, non-cloned canvas-capture video per leased client stream instead of cloning the master track or sharing one master track across all clients. Track ownership explicitly so releasing a client stops only that client-owned direct canvas source, while service-owned output tracks remain intact.

## Architecture Check
- Existing abstractions involved: `AuteuraVirtualOutputService` owns capture, leasing, and teardown; `AuteuraVirtualOutputBridgeService` consumes leased streams and adds their tracks to peer connections.
- Existing conventions involved: the service should own track lifecycle and hide browser-media quirks from the bridge layer.
- Boundary concerns: the fix belongs in service-level track ownership and leasing semantics, not in the bridge protocol.
- Should this be local, extracted, or refactored? Local service fix plus focused test updates.

## Blast Radius
- Upstream impact: browser-camera host registration and client handshake depend on the leased output stream contract.
- Downstream impact: Google Meet/browser-camera consumers depend on continuous video frames after handshake.
- Regression risks: track ownership mistakes could leak streams, stop the wrong tracks on client disconnect, or break delivery-policy refresh behavior.
- Adjacent systems to verify: service unit tests, bridge unit tests, and type/lint validation.

## Implementation Plan
- [x] Triage the bug and confirm the root cause in the current service code.
- [x] Move the ticket to `tickets/in-progress/` when implementation starts.
- [x] Replace cloned leased video-track behavior with direct client-owned canvas capture video while preserving service-owned master output semantics.
- [x] Update focused unit tests to prove the new ownership/teardown contract.
- [x] Run targeted validation and document exact results.

## Validation Plan
List the exact commands or verification steps you expect to run.
- [ ] typecheck
- [ ] lint
- [ ] unit tests
- [ ] integration tests
- [ ] e2e tests not required unless a directly related browser-camera case exists
- [ ] build not required unless the change broadens beyond the service/tests
- [ ] manual verification if needed; Chrome/Meet signoff remains a residual gap unless explicitly run

Commands:
```bash
volta run npm run typecheck
volta run npm run lint
volta run npx vitest run src/services/__tests__/AuteuraVirtualOutputService.test.ts src/services/__tests__/AuteuraVirtualOutputBridgeService.test.ts
```

## Progress Log
### 2026-03-27 06:00
- completed targeted validation and moved the ticket to `tickets/review/` with `Status: READY_FOR_REVIEW`
- validation results:
  - `volta run npm run typecheck` passed
  - `volta run npm run lint` passed
  - `volta run npx vitest run src/services/__tests__/AuteuraVirtualOutputService.test.ts src/services/__tests__/AuteuraVirtualOutputBridgeService.test.ts` passed (`13 passed`)
- final implementation shape:
  - service-owned output video now uses direct master canvas tracks
  - leased client video now uses a dedicated direct canvas-capture source stream per client
  - client release stops only the client-owned video source stream
  - audio still follows the service-owned output-track path

### 2026-03-27 05:56
- moved the ticket to `tickets/in-progress/` and started implementation
- implemented the local ownership fix in `AuteuraVirtualOutputService`
  - service-owned master output video tracks now come directly from the service canvas source stream instead of cloned canvas tracks
  - each leased client stream now gets its own direct canvas-capture video source stream instead of a cloned output video track
  - releasing a client now stops only that client-owned video source stream
- updated focused service tests to lock the new contract:
  - clients receive isolated direct video tracks
  - releasing one client stops only that client-owned video track
  - delivery-policy refresh still leaves leased client streams intact in the unit-test surface

### 2026-03-27 05:47
- created the ticket and completed pre-code triage while keeping it in `tickets/backlog/`
- findings:
  - `replaceVideoTracks()` currently clones canvas-capture video into the service output stream
  - `createClientOutputStream()` clones again when leasing client streams
  - `releaseClientOutputStream()` stops leased tracks on disconnect
  - existing unit tests encode that leased streams survive delivery-policy refresh, which means a naive shared-master-track fix would regress current refresh semantics
- decision:
  - do not blindly share one master video track across all clients
  - implement a local service fix that gives each leased client a direct, non-cloned canvas-capture video source with explicit ownership

## Changed Files
- tickets/review/AUTEURA-MAINT-006.md
- src/services/AuteuraVirtualOutputService.ts
- src/services/__tests__/AuteuraVirtualOutputService.test.ts

## Validation Results
Record exact commands and results.

```bash
rg -n "captureStream|clone\\(|createClientOutputStream|releaseClientOutputStream|replaceVideoTracks" src/services/AuteuraVirtualOutputService.ts src/services/__tests__/AuteuraVirtualOutputService.test.ts
# result: confirmed the current clone-heavy video path and client stop behavior

rg -n "getOutputStream\\(|createClientOutputStream\\(|releaseClientOutputStream\\(" src/services/AuteuraVirtualOutputBridgeService.ts src/controllers/RenderController.tsx
# result: confirmed the bridge depends on the leased-stream contract and the render controller can refresh delivery policy independently

volta run npm run typecheck
# result: passed

volta run npm run lint
# result: passed

volta run npx vitest run src/services/__tests__/AuteuraVirtualOutputService.test.ts src/services/__tests__/AuteuraVirtualOutputBridgeService.test.ts
# result: passed
# summary: 2 passed files, 13 passed tests
```

## Blockers
If blocked, record:
- exact blocker
- exact failed command
- exact error
- whether environment provisioning was attempted
- what remains unverified

## Residual Risks
- Even after the service fix, real Chrome/Meet manual verification remains desirable because the current compatibility matrix still marks live browser-camera signoff as manual pending.
- The broader virtual-output lifecycle/extraction work remains tracked separately and is out of scope here.
- Existing leased client streams intentionally retain their own direct canvas-capture video source through delivery-policy refresh in the unit-test surface. If future requirements need live renegotiation to a new FPS or canvas source for already-connected clients, that should be handled explicitly as follow-up work.

## Final Summary
Fixed the Chrome one-frame browser-camera freeze by removing cloned leased video-track behavior from `AuteuraVirtualOutputService`. The service now keeps its own master output video tracks for status/host use, but each leased client stream gets a dedicated direct canvas-capture video source, so the browser-camera consumer receives a live non-cloned canvas track. Releasing a client now stops only that client-owned video source, while service-owned output tracks remain intact. Focused service and bridge tests, typecheck, and lint are all green. The remaining uncertainty is manual Chrome/Meet signoff, which is already tracked as manual pending in the compatibility matrix.
