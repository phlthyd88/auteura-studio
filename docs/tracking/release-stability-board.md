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
| `AUTEURA-108` | `ready` | `critical` | Lazy mic acquisition and lifecycle ownership | `unassigned` | none | pending |
| `AUTEURA-109` | `ready` | `critical` | Stream generated-track export output instead of buffering | `unassigned` | none | pending |
| `AUTEURA-110` | `ready` | `high` | Stop strict media access from hydrating full large assets | `unassigned` | `AUTEURA-109` recommended | pending |
| `AUTEURA-111` | `ready` | `high` | Recover renderer after frame exceptions | `unassigned` | none | pending |

## Pre-Scale Hardening

| ID | Status | Severity | Title | Owner | Dependency | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `AUTEURA-112` | `ready` | `high` | Make browser-camera heartbeat resilient to timer throttling | `unassigned` | none | pending |
| `AUTEURA-113` | `ready` | `medium` | Guard async camera device refresh after unmount | `unassigned` | none | pending |
| `AUTEURA-114` | `ready` | `medium` | Represent unavailable linked media truthfully | `unassigned` | none | pending |
| `AUTEURA-115` | `ready` | `medium` | Stop project listing from materializing full records | `unassigned` | none | pending |
| `AUTEURA-116` | `ready` | `medium` | Persist and resurface update-ready state | `unassigned` | none | pending |
| `AUTEURA-117` | `ready` | `high` | Explicitly release WebGL contexts on final disposal | `unassigned` | none | pending |

## Completed Stabilization Baseline

| ID | Status | Severity | Title | Notes |
| --- | --- | --- | --- | --- |
| `AUTEURA-101` | `done` | `critical` | Chunked recording persistence | recording no longer buffers entire session in RAM |
| `AUTEURA-102` | `done` | `critical` | Split media metadata from payload blobs | includes migration audit |
| `AUTEURA-103` | `done` | `high` | Skip AI frames during model synchronization | prevents init error storm |
| `AUTEURA-104` | `done` | `high` | Reuse renderer across quality-tier changes | avoids renderer recreation on normal reconfiguration |
| `AUTEURA-105` | `done` | `medium` | Bound decoded audio cache with LRU | caps timeline decode growth |
| `AUTEURA-107` | `done` | `high` | Add pressure-oriented validation | unit and browser-level pressure checks |

## Release Exit Criteria

Do not tag a release candidate until:

- `AUTEURA-108`, `AUTEURA-109`, `AUTEURA-110`, and `AUTEURA-111` are `done`
- each release blocker has recorded validation evidence
- `npm run test:unit` passes
- the critical-path Playwright suite passes

## Operating Rules

- Every active fix must reference one of these ticket IDs.
- New findings from audits or incidents must be added here before implementation starts.
- If a ticket is superseded, update the dependency/evidence fields rather than deleting history.
