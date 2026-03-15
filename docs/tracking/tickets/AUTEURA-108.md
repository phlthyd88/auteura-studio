# AUTEURA-108: Lazy mic acquisition and lifecycle ownership

- Status: `done`
- Severity: `critical`
- Release Gate: `release_blocker`
- Owner: `unassigned`
- Created: `2026-03-15`
- Updated: `2026-03-15`
- Dependencies: `none`

## Summary

The app acquires and holds a microphone stream for live metering even when the user is not actively recording or otherwise using audio input.

## Problem

[CameraController.tsx](../../src/controllers/CameraController.tsx#L356) starts live input metering on controller mount and retains the input stream until unmount.

## Why It Matters

Always-on mic capture is a privacy, battery, and device-contention problem. It also makes lifecycle ownership between camera, audio, and recording controllers unclear.

## Failure Mode

- trigger: open the app and leave it idle, background it, or use another app that needs the microphone
- observable behavior: browser mic indicator stays active; other apps may fail to acquire the device
- likely user impact: trust loss, background resource drain, intermittent input-device conflicts

## Scope

- affected files:
  - [CameraController.tsx](../../src/controllers/CameraController.tsx#L356)
  - [AudioContext.tsx](../../src/context/AudioContext.tsx)
  - [AudioMeterService.ts](../../src/services/AudioMeterService.ts)
- affected subsystems:
  - MediaDevices
  - Web Audio
  - recording lifecycle
- out of scope:
  - waveform display redesign

## Acceptance Criteria

- [ ] microphone input is only acquired when a feature explicitly requires it
- [ ] the mic is released on idle or hidden states where live metering is not required
- [ ] recording and metering recover cleanly after release/reacquire cycles
- [ ] browser mic indicator does not remain active for the full idle app session

## Implementation Notes

- move mic ownership behind an explicit request/release API
- keep recording authority separate from passive metering UI
- add visibility-aware suspend behavior if metering remains enabled outside recording

## Validation

- required automated checks:
  - unit coverage for request/release cycles
  - hidden/visible lifecycle test
- required manual/runtime checks:
  - verify mic indicator turns off after release
  - verify reacquisition works before recording
- closure evidence:
  - `npm run typecheck`
  - `./node_modules/.bin/vitest run /home/jlf88/auteura/src/context/__tests__/AudioContext.test.tsx /home/jlf88/auteura/src/services/__tests__/MediaStorageService.test.ts /home/jlf88/auteura/src/workers/__tests__/VisionWorkerRuntime.test.ts /home/jlf88/auteura/src/engine/__tests__/GLRenderer.test.ts`

## Change Log

- `2026-03-15`: initial ticket created from release audit
- `2026-03-15`: closed after moving live input acquisition to explicit audio-provider leases and removing camera-controller-owned mic capture
