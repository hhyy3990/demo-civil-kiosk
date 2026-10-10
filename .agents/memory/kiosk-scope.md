---
name: Kiosk scope
description: Scope boundaries for the public-service kiosk demo and future integrations.
---

Keep the project as a standalone Korean civil-document kiosk demo focused on 주민등록표(등본) issuance. Preserve the existing QR and accessibility-profile integration; AI APIs remain out of scope.

**Why:** The user explicitly expanded the demo to include the existing QR/accessibility SDK integration while retaining the resident-registration issuance focus and excluding AI API connections.

**How to apply:** Maintain the certificate issuance flow, QR profile behavior, and accessibility settings without changing the central QR API contract or adding AI APIs.

For SDK layout diagnostics, the registered scroll area must be contained by the SDK root. This kiosk's content pane can expand with its contents while the document itself scrolls, so scope SDK layout to the document element and register `document.scrollingElement`; keep action and control discovery scoped to the kiosk.

**Why:** Registering the expanding content pane as a scroll area reported zero scroll range, causing scroll-space corrections to be rolled back even though the page could scroll.

**How to apply:** When integrating layout diagnostics, measure the actual scrolling element and ensure it is inside the SDK root; preserve the kiosk-local adapter queries for actions, text, and fixed controls.

On mobile, `.screen-content` can expand with the menu and have no internal scroll range while the document owns the overflow. Keep vertical overscroll chaining enabled so touch, wheel, and trackpad input can reach the document; horizontal chaining can remain contained to avoid sideways page movement.

**Why:** Contained overscroll blocked normal vertical gestures even though the document had scroll range. Allowing vertical chaining restored touch-simulated, wheel, and trackpad-like scrolling without introducing a second scroll region.

**How to apply:** Keep a single document scroll owner when the content pane expands; use `overscroll-behavior-y: auto` and preserve the fixed footer and horizontal overflow protections.

With extra-large text and large controls on a short mobile viewport, lower keypad rows can start behind the fixed footer even when the menu itself scrolls correctly. A natural document swipe can reveal them; verify actual hit targets after scrolling rather than assuming visible DOM controls are touchable.

**Why:** Browser touch testing at 390×844 showed the resident-number screen needed a document scroll before its last keypad row could be tapped; the complete flow then succeeded.

**How to apply:** Test both the initial and scrolled positions on each long issuance screen, measure the true scroll owner, and report footer overlap separately from whether touch scrolling recovers access.

The additional-menu hint is SDK-owned. Register the actual certificate buttons in DOM order only while the main-menu screen is active, together with the document scroll owner and fixed footer; do not duplicate the hint UI in the kiosk.

**Why:** The user requested the common SDK feature to decide when and where the hint appears, without host-specific hint logic or display on unrelated screens.

**How to apply:** For future menu screens, adapt the SDK regions to the real list and scroll owner, and let the SDK create, reposition, and remove its hint.

In SDK v0.3.4, the menu hint is intentionally suppressed when no safe placement remains; the root records `data-a11y-scroll-guidance="no-safe-space"`.

**Why:** Narrow screens with large accessibility controls can have more hidden menu items but no area that fits a hint without covering controls.

**How to apply:** Distinguish this safe-space state from an unreachable menu or SDK failure. Do not add a host-owned duplicate hint; report the limitation unless the shared SDK placement behavior changes.
