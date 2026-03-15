# AUTEURA-117: Explicitly release WebGL contexts on final disposal

- Status: `done`
- Severity: `high`
- Release Gate: `pre_scale`
- Owner: `unassigned`
- Created: `2026-03-15`
- Updated: `2026-03-15`
- Dependencies: `none`

## Summary

Renderer teardown relies on normal object disposal without explicitly losing the WebGL context.

## Problem

[GLRenderer.ts](../../src/engine/GLRenderer.ts#L49) disposes the pipeline but does not request context loss on final shutdown.

## Why It Matters

Repeated remounts or fallback cycles can accumulate active contexts until the browser refuses new ones.

## Acceptance Criteria

- [x] final renderer disposal explicitly releases the WebGL context when supported
- [x] disposal remains safe and idempotent
- [x] tests cover repeated create/dispose cycles

## Validation

- required automated checks:
  - renderer disposal/context release test
- closure evidence:
  - `npm run typecheck`
  - `vitest run src/engine/__tests__/GLRenderer.test.ts src/engine/__tests__/ResourcePool.test.ts`

## Change Log

- `2026-03-15`: initial ticket created from release audit
- `2026-03-15`: added explicit `WEBGL_lose_context` release on final renderer disposal and covered idempotent repeated shutdown
