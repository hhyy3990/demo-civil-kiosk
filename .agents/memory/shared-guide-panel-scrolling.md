---
name: Shared guide panel scrolling
description: Observed scroll handoff behavior when the common SDK guidance panel is expanded.
---

In SDK v0.5.14, a guidance panel displayed over a compact bottom viewport captures wheel/touch gestures that begin inside its visible area. The kiosk scroll area does not move from those gestures; collapsing the panel or starting the gesture outside it allows the host scroll area to move. After the host scrolls, the SDK repositions the panel away from the registered keypad actions.

**Why:** This can look like the host screen is not scrollable even when the registered scroll area has overflow and no event handler prevents scrolling.

**How to apply:** Test expanded and collapsed guidance states separately on compact screens. If scroll handoff is still undesirable, report it to the shared SDK project; do not add kiosk-specific CSS or repeated programmatic scrolling.
