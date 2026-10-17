---
name: Easy-guide mode reflow
description: SDK viewport-mode reflow can still clip easy-language guidance in a tight mobile viewport.
---

**Rule:** SDK v0.5.26 left stale easy-language pagination after `setViewportMode()`. SDK v0.5.27 does re-paginate on a mode change, but a 320×844 bottom-80% case still clips the current text below the guidance panel. Do not add host refresh calls or CSS workarounds.

**Why:** In v0.5.27, a long test explanation changed from 24 pages to 208 on a normal-to-bottom-80% transition, but after animation settled the panel bottom was 126px while the text bottom was 136.97px; the panel had `scrollHeight` 128px and `clientHeight` 116px with hidden overflow.

**How to apply:** On each SDK update, test a long explanation through viewport-mode changes and inspect settled panel, text, and pager bounds. If content clips, treat it as an SDK-level defect and stop host-side workarounds.
