# Dependency Security Notes

## Build-time audit exception: `serialize-javascript`

Status: tracked  
Severity reported by `npm audit`: high  
Current decision: do not run `npm audit fix --force`

### Affected dependency chain

- `vite-plugin-pwa@0.21.2`
- `workbox-build@7.4.0`
- `@rollup/plugin-terser@0.4.4`
- `serialize-javascript@6.0.2`

### Advisory

- `serialize-javascript <= 7.0.2`
- advisory: RCE via `RegExp.flags` / `Date.prototype.toISOString()`

### Why Auteura is not force-fixing this now

The vulnerable package is currently present in the build toolchain, not in the shipped browser runtime bundle.

`npm audit fix --force` currently proposes downgrading `vite-plugin-pwa` to `0.19.8`. That is the wrong tradeoff for this project because it risks breaking the current PWA/service-worker setup while moving backwards in the dependency graph.

### Current policy

1. Do not run `npm audit fix --force` for this advisory.
2. Keep the current `vite-plugin-pwa` / `workbox-build` stack until upstream ships a clean fix path.
3. Re-check this chain when upgrading:
   - `vite-plugin-pwa`
   - `workbox-build`
   - `@rollup/plugin-terser`
4. Treat this as a tracked build-time supply-chain issue, not a production client-runtime emergency.

### Exit condition

This note can be removed once the dependency chain no longer resolves to `serialize-javascript@6.x` and the replacement path does not require a breaking downgrade of Auteura's PWA stack.
