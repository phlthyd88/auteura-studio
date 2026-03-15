# AUTEURA-117: Explicitly release WebGL contexts on final disposal

- Status: `ready`
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

- [ ] final renderer disposal explicitly releases the WebGL context when supported
- [ ] disposal remains safe and idempotent
- [ ] tests cover repeated create/dispose cycles

## Validation

- required automated checks:
  - renderer disposal/context release test
- closure evidence:
  - pending

## Change Log

- `2026-03-15`: initial ticket created from release audit
