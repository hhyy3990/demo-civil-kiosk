---
name: Easy-guide mode reflow
description: SDK viewport-mode reflow can still clip easy-language guidance in a tight mobile viewport.
---

**Rule:** SDK v0.5.26 left stale easy-language pagination after `setViewportMode()`. SDK v0.5.27 re-paginates on mode changes; v0.5.28's automatic bottom-80% mode with easy language on and no explicit viewport setting intentionally includes the first menu. The kiosk's first menu must also show the SDK-provided easy-language notice; a host-specific guide can override that content, so do not change the host connection without approval.

**Why:** In v0.5.27, a long test explanation changed from 24 pages to 208 on a normal-to-bottom-80% transition, but after animation settled the panel bottom was 126px while the text bottom was 136.97px; the panel had `scrollHeight` 128px and `clientHeight` 116px with hidden overflow. The project later explicitly required easy-language auto-80% on the first menu too. A mocked v4 profile confirmed that sizing works, but the screen showed the host's custom “증명서 선택” guidance instead of the required SDK notice. At 320px and 360px, guide page counters also changed when explanation titles changed available height, although the full host text stayed in order and unclipped.

**How to apply:** On each SDK update, test long explanations through viewport-mode changes and inspect settled panel/text/pager bounds. With easy language on and no explicit viewport mode, verify bottom-80% on the first menu as well as work screens, then verify the exact first-menu notice. If the host's guide replaces it, report the minimum SDK/host connection change and wait for approval; do not add CSS or scroll workarounds.
