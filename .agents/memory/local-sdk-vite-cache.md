---
name: Local SDK Vite cache
description: Vite may keep an old optimized bundle after this project updates an SDK from a local tarball.
---

When updating a local SDK tarball, the installed package version can be current while `node_modules/.vite/deps` still contains the old runtime implementation and lacks newly added methods. Remove the generated Vite dependency cache and restart the workflow before browser verification; confirm the optimized bundle exposes the new API.

**Why:** After updating the kiosk SDK from 0.2.0 to 0.2.1, the stale Vite prebundle still ran 0.2.0 and caused the new session methods to be undefined at runtime, even though type checks used the installed package.

**How to apply:** For local tarball updates that add public APIs, clear the generated Vite cache and restart once. Do not patch the SDK internals to compensate.
