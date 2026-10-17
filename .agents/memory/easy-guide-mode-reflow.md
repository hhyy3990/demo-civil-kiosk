---
name: Guide overlay reflow and clipping
description: SDK easy-language pagination and expanded Smart Guide sizing need constrained-viewport checks.
---

**Rule:** Easy-language pagination may shift its page counters when titles change available space, even if the full text remains sequential. In a constrained 320×844 viewport with bottom-80% mode, expanded Smart Guide content can overflow the SDK toast; do not compensate with host CSS or repeated scrolling.

**Why:** The kiosk's actual payment Smart Guide at 320×844 with large text/buttons, high contrast, easy language, and bottom-80% had a 134.6px toast with `scrollHeight` 154px; its 67-character body extended about 20px below the toast while overflow was hidden. Easy-language checks at 320px and 360px also showed page-counter discontinuities as explanation titles changed, although text stayed in order and panel top stayed stable.

**How to apply:** On each SDK update, test both multi-page easy-language content and an expanded long Smart Guide at 320×844/bottom-80%. If text extends beyond the toast or its scroll height exceeds the visible height, stop host regression tests and report the shared SDK issue; do not add host CSS or scroll workarounds.
