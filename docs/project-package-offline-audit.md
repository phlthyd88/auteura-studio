# Project Package Offline Audit

This audit closes `P24-04B` for the current manifest-first package path.

## Scope

Audited implementation:
- [ProjectPackageService.ts](/home/jlf88/auteura/src/services/ProjectPackageService.ts)
- [TimelineController.tsx](/home/jlf88/auteura/src/controllers/TimelineController.tsx)
- [TimelinePanel.tsx](/home/jlf88/auteura/src/components/TimelinePanel.tsx)
- [vite.config.ts](/home/jlf88/auteura/vite.config.ts)

## Result

Current project package export/import is `offline-safe`.

## Why it is offline-safe

1. Packaging uses only bundled application code.
   - No runtime CDN fetches
   - No dynamic imports
   - No worker/WASM dependency

2. Export writes only local manifest data.
   - `showSaveFilePicker()` path writes directly to a local file handle
   - fallback path creates a local Blob download for small packages

3. Import reads only a local file selected by the user.
   - no remote fetch is involved
   - the embedded project record is parsed through runtime schema validation before use

4. No service-worker-precached asset is required for packaging itself.
   - the service lives in the main bundled app code
   - if the app shell is already cached and running offline, package import/export remains available

## Current limitations

1. Package mode is `manifest-only`.
   - referenced media descriptors are included
   - heavy source binaries are not embedded

2. File System Access API is optional.
   - when supported, export streams to disk
   - when unsupported, only small manifest packages are allowed through Blob download fallback

## Audit assertions

The current implementation intentionally maintains:
- `networkDependencyCount = 0`
- `dynamicImportCount = 0`
- `requiresPrecachedAssets = false`

Those values are also exposed through `getOfflinePackagingAuditSnapshot()` in
[ProjectPackageService.ts](/home/jlf88/auteura/src/services/ProjectPackageService.ts).

## Change rule

If future package work adds any of the following:
- worker-based compression
- WASM archiving
- dynamic module loading
- remote fetch of helpers or schemas

then this audit must be updated and the package path must not be considered `offline-safe`
until those assets are explicitly bundled and service-worker-cached.
