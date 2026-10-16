---
name: Shared guide panel scrolling
description: Observed scroll handoff behavior when the common SDK guidance panel is expanded.
---

In SDK v0.5.14, a guidance panel displayed over a compact bottom viewport captures wheel/touch gestures that begin inside its visible area. The kiosk scroll area does not move from those gestures; collapsing the panel or starting the gesture outside it allows the host scroll area to move. After the host scrolls, the SDK repositions the panel away from the registered keypad actions.

**Why:** This can look like the host screen is not scrollable even when the registered scroll area has overflow and no event handler prevents scrolling.

**How to apply:** Test expanded and collapsed guidance states separately on compact screens. If scroll handoff is still undesirable, report it to the shared SDK project; do not add kiosk-specific CSS or repeated programmatic scrolling.

SDK v0.5.25 adds capped `overflow-y:auto` to the guide panel, but long text still cannot be scrolled by users in the bottom-viewport layout: the panel and copy remain `pointer-events:none`, so hit testing passes through to the host root and wheel/touch gestures change neither scroll position.

**Why:** At 390×844 with bottom 60%, a long test explanation produced a 3,764px guide scrollHeight against 282px clientHeight, but hit testing at the panel center returned `#root`; both wheel and synthesized touch left guide, stage, and document scrollTop at zero.

**How to apply:** Verify hit targets and actual wheel/touch scrollTop changes, not just the existence of overflow. Treat this as shared SDK work; do not add host CSS or scroll-forwarding workarounds.
