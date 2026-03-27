# Release Stability Board

This board tracks the remaining reliability and release-hardening work after the current stabilization phase.

## Status Legend

- `identified`: problem captured but not yet scheduled
- `ready`: scoped and ready to implement
- `in_progress`: actively being worked
- `blocked`: cannot proceed until a dependency or decision lands
- `validation`: code complete, awaiting evidence
- `done`: validated and closed

## Active Release Blockers

| ID | Status | Severity | Title | Owner | Dependency | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `AUTEURA-108` | `done` | `critical` | Lazy mic acquisition and lifecycle ownership | `unassigned` | none | `typecheck` + targeted vitest coverage |
| `AUTEURA-109` | `done` | `critical` | Stream generated-track export output instead of buffering | `unassigned` | none | `typecheck` + vitest + focused Playwright export |
| `AUTEURA-110` | `done` | `high` | Stop strict media access from hydrating full large assets | `unassigned` | `AUTEURA-109` recommended | `typecheck` + targeted vitest + focused Playwright export |
| `AUTEURA-111` | `done` | `high` | Recover renderer after frame exceptions | `unassigned` | none | `typecheck` + targeted vitest + focused Playwright fallback |

## Pre-Scale Hardening

| ID | Status | Severity | Title | Owner | Dependency | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `AUTEURA-112` | `done` | `high` | Make browser-camera heartbeat resilient to timer throttling | `unassigned` | none | `typecheck` + targeted vitest bridge coverage |
| `AUTEURA-113` | `done` | `medium` | Guard async camera device refresh after unmount | `unassigned` | none | `typecheck` + targeted controller vitest coverage |
| `AUTEURA-114` | `done` | `medium` | Represent unavailable linked media truthfully | `unassigned` | none | `typecheck` + targeted media-storage vitest coverage |
| `AUTEURA-115` | `done` | `medium` | Stop project listing from materializing full records | `unassigned` | none | `typecheck` + targeted project-storage vitest coverage |
| `AUTEURA-116` | `done` | `medium` | Persist and resurface update-ready state | `unassigned` | none | `typecheck` + targeted PWA prompt vitest coverage |
| `AUTEURA-117` | `done` | `high` | Explicitly release WebGL contexts on final disposal | `unassigned` | none | `typecheck` + targeted renderer vitest coverage |
| `AUTEURA-118` | `done` | `medium` | Establish controller refactor guardrails before extraction | `unassigned` | none | `typecheck` + lint + unit + full Playwright |
| `AUTEURA-119` | `identified` | `high` | Investigate intermittent hidden-tab timelapse shot-count drift | `unassigned` | none | intermittent critical-path Playwright failure observed once; latest rerun passed |

## Completed Stabilization Baseline

| ID | Status | Severity | Title | Notes |
| --- | --- | --- | --- | --- |
| `AUTEURA-101` | `done` | `critical` | Chunked recording persistence | recording no longer buffers entire session in RAM |
| `AUTEURA-102` | `done` | `critical` | Split media metadata from payload blobs | includes migration audit |
| `AUTEURA-103` | `done` | `high` | Skip AI frames during model synchronization | prevents init error storm |
| `AUTEURA-104` | `done` | `high` | Reuse renderer across quality-tier changes | avoids renderer recreation on normal reconfiguration |
| `AUTEURA-105` | `done` | `medium` | Bound decoded audio cache with LRU | caps timeline decode growth |
| `AUTEURA-108` | `done` | `critical` | Lazy mic acquisition and lifecycle ownership | live input is lease-driven instead of camera-controller owned |
| `AUTEURA-109` | `done` | `critical` | Stream generated-track export output instead of buffering | export persists chunked output directly to storage |
| `AUTEURA-110` | `done` | `high` | Stop strict media access from hydrating full large assets | preview/export/download use playback handles and sequential chunk reads |
| `AUTEURA-111` | `done` | `high` | Recover renderer after frame exceptions | runtime render failures fall back or reinitialize instead of killing preview |
| `AUTEURA-112` | `done` | `high` | Make browser-camera heartbeat resilient to timer throttling | liveness is deadline-based and suspended across hidden-tab drift |
| `AUTEURA-117` | `done` | `high` | Explicitly release WebGL contexts on final disposal | final renderer teardown now uses `WEBGL_lose_context` when supported |
| `AUTEURA-113` | `done` | `medium` | Guard async camera device refresh after unmount | stale `enumerateDevices()` completions are ignored after unmount/supersession |
| `AUTEURA-114` | `done` | `medium` | Represent unavailable linked media truthfully | unavailable linked items now carry explicit runtime availability status |
| `AUTEURA-115` | `done` | `medium` | Stop project listing from materializing full records | list/latest now query metadata store and backfill legacy records |
| `AUTEURA-116` | `done` | `medium` | Persist and resurface update-ready state | update-ready state survives dismissal and resurfaces on reminder with capture-safe restart gating |
| `AUTEURA-107` | `done` | `high` | Add pressure-oriented validation | unit and browser-level pressure checks |

## Release Exit Criteria

Do not tag a release candidate until:

- `AUTEURA-110` and `AUTEURA-111` are `done`
- each release blocker has recorded validation evidence
- `npm run test:unit` passes
- the critical-path Playwright suite passes

## Operating Rules

- Every active fix must reference one of these ticket IDs.
- New findings from audits or incidents must be added here before implementation starts.
- If a ticket is superseded, update the dependency/evidence fields rather than deleting history.
