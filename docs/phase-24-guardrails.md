# Phase 24 Guardrails

This document defines the non-negotiable execution, storage, offline, and compatibility rules
for Phase 24. Every ticket in Phase 24 must conform to these constraints.

## Scope

This guardrail set applies to:
- `P24-01` capture preset model
- `P24-02A` timelapse runtime with visibility policy
- `P24-03A` media ingest via file handles
- `P24-04A` streaming project package architecture
- `P24-04B` offline packaging asset audit
- `P24-05` runtime schema validation and migration
- `P24-05B` service worker / schema compatibility policy
- `P24-06` timeline history memory strategy
- `P24-07` capture and ingest UI cohesion
- `P24-08` virtual camera / platform feasibility spike
- `P24-09` verification and failure-mode coverage

## Core Product Rules

1. Offline-first is mandatory.
   - Project import/export must function with the network disabled.
   - No Phase 24 feature may depend on runtime CDN fetches or remote module loading.
   - Any worker, WASM, or packaging dependency must ship locally and be available to the service worker precache.

2. Scalable-pro behavior remains in force.
   - Features must degrade gracefully on constrained hardware.
   - Large asset workflows must prefer references, streaming, and bounded memory usage over duplication.

3. User intent must remain explicit.
   - The app may recommend safer settings.
   - The app may warn or block unsupported flows.
   - The app must not silently override imported media strategy, export scope, or capture fidelity claims.

## Timelapse and Interval Capture Rules

1. Main-thread timers are not trustworthy in hidden tabs.
   - `setTimeout` and `setInterval` may be throttled to unusable levels by the browser.
   - Hidden-tab capture must never be presented as frame-accurate unless proven by the platform path in use.

2. Page Visibility handling is required.
   - Timelapse/session capture must listen to `visibilitychange`.
   - If the current browser path cannot guarantee fidelity while hidden, the session must pause or warn.

3. Worker-backed timing is preferred where it materially improves scheduling stability.
   - Even then, the app must still assume hidden-tab degradation can occur.

4. No catch-up burst behavior.
   - If timer events are delayed, the controller must not fire all missed captures immediately on resume.
   - The session must resume from current time, not attempt to retroactively fill gaps.

5. Cleanup is mandatory.
   - All interval/session timers must be ref-owned and cleared on stop, cancel, error, and unmount.
   - All `visibilitychange` listeners must be removed on cleanup.

## Media Ingest Rules

1. Large media must prefer persistent file handles over binary duplication.
   - Use the File System Access API where supported.
   - Store metadata and persistent handles when possible.
   - Do not copy large imported video into IndexedDB by default.

2. Copy-based ingest is fallback-only.
   - Use it only for smaller assets, unsupported browsers, or explicit user choice.
   - The UI must disclose when the app is making a copied import instead of a file-handle reference.

3. Storage quota must be checked before heavy ingest.
   - Use `navigator.storage.estimate()` before accepting copy-based imports.
   - If the budget is unsafe, reject the ingest before partial writes occur.

4. Import must be cancellable.
   - Long-running import/read operations must support `AbortController`.
   - Cancelling an import must leave storage and UI state consistent.

5. Object URLs are temporary only.
   - Any preview or thumbnail object URL must be revoked on cleanup, delete, or unmount.

## Project Packaging and Export Rules

1. Large package export must be streaming-first.
   - Do not build large project packages fully in memory.
   - Use a worker and streaming architecture for medium/large exports.

2. Manifest-first package design is required.
   - Package structure must clearly separate project manifest, metadata, and asset payloads.
   - Missing media, oversized payloads, and partial packages must be detectable up front.

3. Export must support cancel and failure safely.
   - Cancellation must stop work and release temporary buffers/resources.
   - Partial export state must not corrupt stored project state.

4. Offline packaging must be audited.
   - Any compressor/serializer must be bundled locally.
   - If a WASM asset is used, it must be precached and versioned with the app.

## Schema Validation and Compatibility Rules

1. TypeScript types are not enough at storage boundaries.
   - Persisted records must be runtime-validated before entering app state.
   - Corrupted or incomplete records must be rejected or normalized safely.

2. All persisted Phase 24 objects must be versioned.
   - Projects
   - imported media references
   - capture presets
   - look presets / LUT metadata if touched by migration work

3. Migration logic must be centralized.
   - No ticket may normalize legacy data ad hoc inside components.
   - Storage services must own migration entry points.

4. Schema version and service worker version must be coordinated.
   - A stale offline client must not silently mutate newer-version local data.
   - If compatibility is unsafe, the app must block writes and require refresh/update.

## Memory and History Rules

1. Undo/redo must use structural sharing.
   - No deep cloning of full timeline/project graphs for routine edits.
   - History entries must store deltas or shared references.

2. Imported media references must remain lightweight in state.
   - State/history must not duplicate large binary payloads.
   - Handles, ids, and metadata are acceptable; heavy blobs are not.

3. Packaging and ingest must respect browser tab memory limits.
   - Avoid buffering whole projects or large media payloads at once.

## Service Worker and Offline Rules

1. Export/import dependencies must be available offline.
   - Workers
   - WASM
   - schema parsers/migrators
   - packaging utilities

2. Cached-app compatibility must be explicit.
   - New schema, storage, or package formats must define stale-client behavior.

3. No silent mixed-version writes.
   - If local data was created by a newer app version than the current cached client understands, write operations must be disabled until update.

## Verification Requirements

Phase 24 is not complete without the following test categories:

1. Quota exhaustion tests
   - ingest until storage budget is exhausted
   - verify existing media/projects remain intact
   - verify partial imports do not corrupt library state

2. Visibility/throttling tests
   - hidden-tab interval capture
   - verify no catch-up burst behavior
   - verify pause/warn behavior

3. Corrupted package tests
   - malformed JSON
   - incomplete manifests
   - missing referenced assets
   - unsupported schema versions

4. Import cancellation tests
   - abort during large-file ingest
   - verify cleanup and stable library state

5. Object URL cleanup tests
   - delete media
   - remove previews
   - unmount/remount ingest surfaces

6. Offline export/import tests
   - network disabled
   - service worker cached assets only
   - package path still succeeds

## Acceptance Rule

No Phase 24 ticket is considered done if it violates this document, even if the code compiles and the happy path works.
