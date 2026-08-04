---
name: PWA build size limit
description: Workbox precache default 2 MiB limit breaks the production build when the JS bundle exceeds it.
---

The `vite-plugin-pwa` Workbox plugin enforces a default `maximumFileSizeToCacheInBytes` of 2 MiB. The main JS bundle (after tree-shaking) is ~2.3 MiB and exceeds this, causing an error during the production build step and crashing the API server workflow.

**Why:** The error is thrown during the `generateSW` close hook, after Vite has already finished bundling. It's easy to miss because the bundle output looks fine — the error only appears at the very end.

**How to apply:** Always set `maximumFileSizeToCacheInBytes` in the `workbox:` block of `VitePWA(...)` in `vite.config.ts`. Current value: `5 * 1024 * 1024` (5 MiB).
