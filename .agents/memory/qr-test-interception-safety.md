---
name: QR test interception safety
description: Prevent synthetic QR profile tests from reaching the real resolver.
---

Use browser-protocol request interception before loading the app for synthetic QR tests; a page-level `window.fetch` override did not reliably stop a resolver request from reaching the host relay.

**Why:** A synthetic test value unexpectedly produced one real QR resolver request and a 404 JSON response.

**How to apply:** Enable CDP `Fetch` interception before navigation, fulfill the local QR resolver request with synthetic data, and block every off-origin request. Confirm the upstream counter remains zero before entering test values.
