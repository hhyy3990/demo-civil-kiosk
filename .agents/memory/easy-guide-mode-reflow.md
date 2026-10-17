---
name: Easy-guide mode reflow
description: SDK viewport-mode reflow can still clip easy-language guidance in a tight mobile viewport.
---

**Rule:** SDK v0.5.26 left stale easy-language pagination after `setViewportMode()`. SDK v0.5.27 re-paginates on mode changes; v0.5.28 avoids clipping the tested kiosk explanations, but its automatic bottom-80% fallback treats only the literal screen ID `start` as the start screen. This kiosk reports `civil.main-menu`, so the fallback reduces the home screen too. Do not add host CSS or viewport workarounds.

**Why:** In v0.5.27, a long test explanation changed from 24 pages to 208 on a normal-to-bottom-80% transition, but after animation settled the panel bottom was 126px while the text bottom was 136.97px; the panel had `scrollHeight` 128px and `clientHeight` 116px with hidden overflow. In v0.5.28, applying a mocked v4 profile (`easyLanguage=true`, `viewportMode=null`) at the kiosk home added the bottom-viewport class and reduced its 390×844 stage to 543px because `civil.main-menu !== start`. At 320px and 360px, guide page counters also changed when explanation titles changed available height, although the full host text stayed in order and unclipped.

**How to apply:** On each SDK update, test a long explanation through viewport-mode changes, inspect settled panel/text/pager bounds, and test automatic mode with the host's real namespaced start-screen ID. Prefer a generic SDK start-screen contract over host-specific IDs. If text clips or the home screen is incorrectly resized, stop host-side workarounds.
