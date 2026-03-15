# Auteura Browser Camera for Web Apps

This folder contains Auteura's Manifest V3 browser-camera bridge for supported web apps.

Current scope:
- MV3 service worker broker
- isolated-world bridge for supported conference pages
- isolated-world host bridge for local Auteura origins
- MAIN-world shim for synthetic device enumeration and `getUserMedia()` interception
- live Meet-only browser-camera handshake against the Auteura host

Current limitation:
- only Google Meet is currently supported
- broader site support and setup UX are still follow-up tickets
- this remains a browser-scoped source for supported web apps, not a system virtual camera

## Load unpacked in Chrome

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Choose `Load unpacked`
4. Select this folder:

   `./`

## Files

- `manifest.json`
- `background.js`
- `host-bridge.content.js`
- `page-bridge.content.js`
- `page-shim.main.js`

## Compatibility matrix

Manual signoff and browser/site status live in:

- `../../docs/browser-camera-compatibility-matrix.md`

## Current next tickets

- `VC-20` Failure-mode and unsupported-site validation
