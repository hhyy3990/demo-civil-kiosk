---
name: Easy-guide mode reflow
description: Known easy-language pagination behavior in SDK v0.5.26 when viewport mode changes.
---

**Rule:** In SDK v0.5.26, changing `setViewportMode()` can shrink the guidance panel without recalculating its current easy-language pages. This leaves old page content and pager controls outside the panel's clipped bounds. Calling `setEasyLanguageState()` again recalculates the pages, but do not use repeated host calls as a workaround.

**Why:** A 320×844 test changed from normal mode to bottom 80%; the panel shrank to 118px while a 522px text region and its pager remained, clipped by `overflow: hidden`. Reapplying the same guidance split it into 112 pages that fit.

**How to apply:** When testing a newer SDK, change viewport mode with a long easy-language explanation active and inspect the panel, text, and pager bounds. If it still clips, treat it as an SDK-level defect and do not patch host CSS or add repeated refresh calls.
