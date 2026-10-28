---
name: Universal v2 validation boundary
description: Keep the canonical Universal v2 SHA-256 implementation out of the browser bundle.
---

The canonical Universal v2 contract uses the shared SHA-256 helper backed by Node's `node:crypto`. Keep model creation, hash calculation, and full policy/plan validation in the Development server. The browser should send only the non-sensitive host layout snapshot to the local Development endpoint, then enforce current-context and exact preset-ID checks before applying host-owned CSS.

**Why:** Vite externalizes `node:crypto` for browser builds; directly importing the v2 validator into a React hook caused runtime console errors.

**How to apply:** Use the canonical contract from a Development-only Vite middleware, return the validated plan/model, and make the client discard responses after viewport, profile, or screen changes. Never bundle a second browser-side hash implementation or send the request to the central API for a local Fake test.
