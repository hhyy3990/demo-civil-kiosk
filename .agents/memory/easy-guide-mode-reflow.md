---
name: Guide overlay reflow and clipping
description: SDK easy-language pagination and expanded Smart Guide sizing need constrained-viewport checks.
---

**Rule:** Test actual Smart Guide content at both 320×844 and 360×667 with bottom-80% mode. A two-page fit at 320 does not guarantee the same step is available on a shorter screen; when the SDK reports more than two required pages, it suppresses the guide. Treat this as a shared-SDK issue, not a reason to change host copy, CSS, or scroll behavior.

**Why:** The kiosk's actual 67-character payment guidance fit in two visually complete pages at 320×844. At 360×667, the same step required four pages but the SDK allows at most two: panel max-height 99.56px, header 51.19px, body space 44.38px, and measured body height 102.38px. The SDK logged the suppression and showed no Smart Guide.

**How to apply:** On each SDK update, record the actual step ID, text length, profile, viewport, available body height, measured content height, and required page count. If a guide is suppressed, stop host regression tests and report the shared SDK limit; do not add host CSS or rewrite business copy as a workaround.
