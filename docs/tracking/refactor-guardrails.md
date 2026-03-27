# Refactor Guardrails

This document defines the protected user flows, subsystem ownership, and review checklist that must be preserved while extracting large controllers or shell modules.

## Protected Flows

| Flow | Primary facade owner | Supporting subsystems | Current automated protection |
| --- | --- | --- | --- |
| recording persistence across reload plus download/delete | `useRecordingController` | `MediaStorageService`, `AudioContext` | [`e2e/critical-path.spec.ts`](../../e2e/critical-path.spec.ts) `launches, records, persists after reload, and exposes download/delete actions` |
| LUT import plus look preset restore | `useRenderController` | `LutService`, `LookPresetStorageService` | [`e2e/critical-path.spec.ts`](../../e2e/critical-path.spec.ts) `imports a LUT, saves a look preset, and restores both after reload` |
| portrait retouch plus scene insight apply | `useAIController` and `useRenderController` | `AIVisionStateStore`, `SceneAnalysisService` | [`e2e/critical-path.spec.ts`](../../e2e/critical-path.spec.ts) `enables portrait retouch and applies a scene insight recommendation` |
| browser camera fallback workflow | `useRenderController` | `AuteuraVirtualOutputService`, browser-camera setup UI | [`e2e/critical-path.spec.ts`](../../e2e/critical-path.spec.ts) `shows browser camera setup guidance and fallback workflow` |
| hidden-tab timelapse pause and resume | `useRecordingController` | timelapse worker, `MediaStorageService` | [`e2e/critical-path.spec.ts`](../../e2e/critical-path.spec.ts) `pauses timelapse while hidden and does not burst missed captures on resume` |
| project package export | `useTimelineController` | `ProjectPackageService`, `ProjectStorageService` | [`e2e/critical-path.spec.ts`](../../e2e/critical-path.spec.ts) `exports a manifest project package after adding media to the timeline` |
| WebM timeline export and persisted reload | `useTimelineController` | `TimelineExportService`, `MediaStorageService`, `TimelineTransport` | [`e2e/critical-path.spec.ts`](../../e2e/critical-path.spec.ts) `exports a WebM timeline with a multi-segment playable source` |
| large metadata-heavy library load | `useRecordingController` | `MediaStorageService`, media-library UI pagination | [`e2e/critical-path.spec.ts`](../../e2e/critical-path.spec.ts) `opens a large metadata-heavy media library without page failures` |
| WebGL startup fallback | `useRenderController` | `GLRenderer`, `Viewfinder`, `AppLayout` | [`e2e/critical-path.spec.ts`](../../e2e/critical-path.spec.ts) `falls back to the Canvas 2D renderer when WebGL is unavailable` |

## Characterization Coverage

Current characterization coverage for controller extraction:

- [`src/controllers/__tests__/RenderController.test.tsx`](../../src/controllers/__tests__/RenderController.test.tsx)
  - freezes `rendererRuntime` publication semantics
  - verifies fallback backend, failure reason, and derived facade fields stay in sync
  - verifies startup initialization failures publish coherent backend, reason, and error state

Add controller-level characterization tests before extracting internals that would otherwise only be protected by E2E coverage.

## Refactor PR Checklist

Every controller or shell refactor PR must include:

- the protected flows touched by the change
- whether the change preserves or intentionally changes a controller facade contract
- updated characterization tests for changed controller behavior
- targeted verification commands for the affected flow set

Required reviewer checks:

- preserve the hook names and context value field names documented in [`docs/architecture/controller-facades.md`](../architecture/controller-facades.md) unless an approved ticket says otherwise
- preserve or improve single-source-of-truth runtime state; do not reintroduce loosely coupled booleans that can disagree
- keep service extraction behind the existing facade instead of leaking runtime internals into components
- update the critical-path owner mapping in this document when subsystem ownership changes
- link any newly discovered regressions to the ticket board before merging unrelated extraction work
