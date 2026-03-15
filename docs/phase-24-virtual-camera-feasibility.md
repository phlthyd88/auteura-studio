# Phase 24 Browser Camera Feasibility

This document closes `P24-08` as a platform feasibility spike for browser-camera output and
documents why a true system virtual camera remains out of scope for the pure-PWA architecture.

## Decision

**Decision: no-go for a true system virtual camera from a pure browser PWA.**

Auteura should **not** promise a desktop-style system virtual camera device from the web
application alone.

## Why this is a no-go

The web platform lets the app:
- enumerate media devices
- request camera/microphone input
- capture display/tab streams
- process streams inside the page

The web platform does **not** provide a standard API for a PWA to register a new OS-level camera
device that other native applications can see as a webcam.

That means a pure PWA cannot create:
- a system webcam device
- a Chrome-visible webcam device across the whole OS
- a stable cross-browser “virtual camera” abstraction equivalent to desktop apps like OBS

## Feasible paths

### 1. Recommended path: browser-native camera source for supported web apps

This is the path Auteura should favor.

Use Auteura’s existing render/composition output as a browser-native source for:
- in-app monitoring
- recording/export
- tab/window sharing into conferencing tools
- future browser-scoped processed-stream handoff where the platform allows it

This stays aligned with the product:
- PWA-safe
- no native installer
- no fake promise of OS-level camera registration

### 2. Conditional path: browser-limited processed stream handoff

There are browser APIs and experiments around generated tracks / processed media streams, but they
do **not** amount to a real system virtual camera guarantee.

This is useful only for:
- browser-contained workflows
- experimental integrations
- future internal routing between Auteura output and browser consumers

It is **not** a substitute for a real desktop virtual camera device.

### 3. Extension/native helper path

If Auteura ever wants a stronger “virtual camera” workflow, it would require:
- a browser extension, and/or
- a native companion/helper

That would no longer be a pure PWA feature and should be treated as a separate product track.

## Product recommendation

For Auteura Studio, the right move is:

1. **Do not build a fake system virtual camera feature.**
2. **Support browser-native output sharing well.**
   - polished tab/window share guidance
   - “share this processed output” workflow
   - strong monitoring/status around what the remote app will see
3. **Optionally explore browser-scoped processed-stream handoff later**, but market it honestly as
   browser-limited, not system-wide.

## Contract for future work

If a future ticket touches virtual camera behavior, it must follow these rules:

1. Any feature shipped from the PWA alone must be described as:
   - `browser source`
   - `shared studio output`
   - or similar

2. Product-facing UI should prefer phrases like `browser camera`, `browser source`, or
   `camera for supported web apps` for pure-PWA features.

3. A true system virtual camera effort requires a new phase with:
   - extension/native scope decision
   - browser/platform support matrix
   - install/update/security model

## Final recommendation

**Recommended Phase 24 outcome:** keep Auteura pure-PWA and treat virtual camera as out of scope for
the current architecture. Improve browser-native output sharing instead of chasing a system-device
abstraction the web platform does not provide.
