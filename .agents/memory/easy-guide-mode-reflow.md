---
name: Guide overlay reflow and clipping
description: SDK easy-language pagination and expanded Smart Guide sizing need constrained-viewport checks.
---

**Rule:** Test actual Smart Guide content at both 320×844 and 360×667 with bottom-80% mode. The 0.5.28 candidate renders the real payment notice in two pages at 360×667 with a 44px header and 52px body; its copy box measures 1px taller than its client box, so confirm the glyphs in screenshots instead of treating that rounded difference alone as clipping. Compare easy-guide pages in the same expanded/collapsed state because reflow changes the page count.

**Why:** An earlier 0.5.28 build suppressed the same payment guidance at 360×667, while the final candidate displays it completely in two pages. The easy-language panel also recalculates page totals when expanded and collapsed, but its pre-guide collapsed page and content were restored after the Smart Guide.

**How to apply:** On each SDK update, record the actual step ID, text length, profile, viewport, available body height, measured content height, and required page count. Inspect every rendered page and compare state at matching panel sizes. If a guide is suppressed, stop host regression tests and report the shared SDK limit; do not add host CSS or rewrite business copy as a workaround.
