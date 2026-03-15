# Browser Camera Compatibility Matrix

This document closes `VC-19` as the compatibility-matrix artifact for Auteura's browser-camera
workflow.

It does **not** claim system-level virtual camera support. This matrix applies only to the
browser-camera bridge for supported web apps.

## Scope

Current scope:
- unpacked MV3 extension
- localhost Auteura host
- browser-camera setup flow in the `VIEW` deck
- Meet-only browser-camera injection path

Out of scope:
- native desktop apps as webcam consumers
- OS-level virtual camera devices
- mobile browser support
- non-Chromium extension stores and packaging

## Status legend

- `Automated`: covered by the current automated suite
- `Manual pending`: needs human verification in a real browser session
- `Unsupported`: intentionally not supported
- `Planned`: targeted for a future adapter, not yet implemented

## Current compatibility summary

| Surface | Status | Notes |
| --- | --- | --- |
| Auteura host lifecycle | Automated | Covered by unit tests and app E2E setup flow |
| MV3 broker registration/routing | Automated | Covered by [BrowserCameraExtension.test.ts](/home/jlf88/auteura/src/services/__tests__/BrowserCameraExtension.test.ts) |
| Google Meet browser-camera path | Automated + Manual pending | Handshake/protocol is covered; live manual browser verification still required |
| Chrome stable desktop | Manual pending | Primary target |
| Edge stable desktop | Manual pending | Expected to work, not yet manually signed off |
| Chromium desktop | Manual pending | Expected to work if extension loading and WebRTC policy match Chrome |
| Firefox desktop | Unsupported | No MV3/browser-camera path |
| Safari desktop | Unsupported | No MV3/browser-camera path |
| Mobile browsers | Unsupported | No supported extension/runtime path |
| Zoom web | Planned | No adapter yet |
| Teams web | Planned | No adapter yet |
| Native desktop apps | Unsupported | Use window share or native-helper track instead |

## Manual verification matrix

### Browsers

| Browser | Extension install | Host detected | Host registered | Meet device visible | Meet stream established | Fallback workflow | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Chrome stable | Pending | Pending | Pending | Pending | Pending | Pending | Manual pending |
| Edge stable | Pending | Pending | Pending | Pending | Pending | Pending | Manual pending |
| Chromium | Pending | Pending | Pending | Pending | Pending | Pending | Manual pending |

### Sites

| Site | Synthetic device listed | Device selection works | Video stream established | Reconnect after host refresh | Notes | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Google Meet | Pending | Pending | Pending | Pending | Current supported target | Manual pending |
| Zoom web | N/A | N/A | N/A | N/A | Adapter not implemented | Planned |
| Teams web | N/A | N/A | N/A | N/A | Adapter not implemented | Planned |

### Fallbacks

| Workflow | Auteura setup guidance visible | PiP prep works | Tab/window share usable | Status |
| --- | --- | --- | --- | --- |
| Meet without extension | Automated | Automated | Manual pending | Mixed |
| Desktop app window share | Automated | Automated | Manual pending | Mixed |

## Manual test procedure

### A. Extension install and host registration

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Load unpacked from:
   - `/home/jlf88/auteura/extensions/auteura-browser-camera`
4. Open Auteura on localhost.
5. Open the `VIEW` deck.
6. Confirm:
   - `Extension detected`
   - `Host ready`
   - `Browser Camera Host` shows `registered`

Pass criteria:
- the setup panel updates without a refresh loop
- host registration becomes visible in the `VIEW` deck
- no persistent bridge error is shown

### B. Meet browser-camera path

1. Open `https://meet.google.com`.
2. Start or join a meeting.
3. Open Meet video settings.
4. Select `Auteura Browser Camera`.
5. Confirm the remote preview shows Auteura output.

Pass criteria:
- synthetic device appears in the Meet camera list
- selecting it establishes live video
- stopping/restarting the Meet preview does not kill the host output

### C. Host refresh / reconnect

1. With Meet using `Auteura Browser Camera`, refresh the Auteura tab.
2. Wait for the host to re-register.
3. Confirm the connection recovers or fails with a clear temporary message.

Pass criteria:
- no infinite reconnect storm
- host returns to `registered`
- Meet either recovers or surfaces a temporary interruption cleanly

### D. Fallback workflow

1. Open Auteura without the extension installed or active.
2. Open the `VIEW` deck.
3. Confirm fallback guidance is present.
4. Click `Enable PiP overlay`.
5. Use tab/window share into Meet or another app.

Pass criteria:
- setup panel shows fallback guidance
- PiP prep changes to `PiP ready`
- shared output is usable without the extension path

## Required evidence for signoff

For each browser/site row marked `Manual pending`, collect:
- browser version
- OS version
- whether the extension loaded cleanly
- whether the synthetic device appeared
- whether video established
- whether reconnect worked after host refresh
- any console/runtime errors

## Current automated evidence

Automated coverage currently exists in:
- [AuteuraVirtualOutputService.test.ts](/home/jlf88/auteura/src/services/__tests__/AuteuraVirtualOutputService.test.ts)
- [AuteuraVirtualOutputBridgeService.test.ts](/home/jlf88/auteura/src/services/__tests__/AuteuraVirtualOutputBridgeService.test.ts)
- [VirtualOutputProtocol.test.ts](/home/jlf88/auteura/src/services/__tests__/VirtualOutputProtocol.test.ts)
- [BrowserCameraExtension.test.ts](/home/jlf88/auteura/src/services/__tests__/BrowserCameraExtension.test.ts)
- [critical-path.spec.ts](/home/jlf88/auteura/e2e/critical-path.spec.ts)

## Recommendation

Treat Chrome stable + Google Meet as the first manual signoff target.

Do **not** claim broader support publicly until:
- Chrome stable desktop is manually signed off
- at least one reconnect scenario is manually verified
- the fallback workflow is visually confirmed in a real session
