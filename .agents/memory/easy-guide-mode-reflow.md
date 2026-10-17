---
name: Guide overlay reflow and clipping
description: SDK easy-language pagination and expanded Smart Guide sizing need constrained-viewport checks.
---

**Rule:** Easy-language page totals depend on final panel height even when host copy is unchanged. At SDK 0.5.28, auto-80 produced 2 pages at 390×844, 6 at 360×667, and 4 at 320×844; collapsing the 360px panel changed 6 pages to 4, and expanding restored 6. Smart Guide temporarily hides the easy-language pager; after dismissal the guide returned to page 1/6. A workflow warning reported 77px rendered / 44px available / 26px minimum line and three pages, while settled measurements differed, so correlate warnings with settled DOM. The reported 1/21 state was not reproduced.

**Why:** An earlier 0.5.28 build suppressed the same payment guidance at 360×667, while the final candidate displays it completely in two pages. Measurements also showed that identical host copy can fragment as the SDK's available panel height changes; a warning can reflect a transient reflow rather than the final page count.

**How to apply:** On each SDK update, record the actual step ID, text length, profile, viewport, settled available body height, measured content height, and every rendered page. Compare warning values with the settled DOM and record whether page totals change on resize or navigation. If a guide is suppressed, stop host regression tests and report the shared SDK limit; do not add host CSS or rewrite business copy as a workaround.
