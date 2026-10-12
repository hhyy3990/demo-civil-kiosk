---
name: Kiosk scope
description: Scope boundaries for the public-service kiosk demo and future integrations.
---

Keep the project as a standalone Korean civil-document kiosk demo focused on 주민등록표(등본) issuance. Preserve the existing QR and accessibility-profile integration; AI APIs remain out of scope.

**Why:** The user explicitly expanded the demo to include the existing QR/accessibility SDK integration while retaining the resident-registration issuance focus and excluding AI API connections.

**How to apply:** Maintain the certificate issuance flow, QR profile behavior, and accessibility settings without changing the central QR API contract or adding AI APIs.

Scroll ownership is state-dependent. On mobile, the SDK QR entry dock makes `.stage` the scroll area on the home screen; after leaving home, the document can own the remaining scroll range. With a bottom-viewport profile, `.stage` stays the active scroll area across screens.

**Why:** Replit Preview measurements at 390×844 showed different owners on the home and inner screens; v3 bottom-viewport mode fixed `.stage` and retained its nonzero `scrollTop` across a `screenId` change.

**How to apply:** Measure the actual owner for each screen and mode. Keep action and control discovery scoped to the kiosk, and do not assume that document, `.stage`, or `.screen-content` is always the owner.

On mobile, `.screen-content` may have no internal scroll range. The home QR dock can make `.stage` scrollable, while an inner screen without the dock can return overflow to the document. Keep vertical overscroll chaining available to the active owner; horizontal chaining can remain contained.

**Why:** The active owner changes with SDK dock state as well as viewport mode. Treating `.screen-content` or the document as a universal scroll owner can misdiagnose both gesture failures and screen-transition offsets.

**How to apply:** Re-measure after entering and leaving the home screen and after applying a QR profile; preserve the fixed footer and horizontal overflow protections.

The SDK v0.5.3 public API has no screen-change scroll-reset operation. Its QR dock changes root overflow/height classes, and bottom-viewport mode retains the root scroll position when the adapter's `screenId` changes.

**Why:** Browser interaction in Replit Preview showed `.stage.scrollTop` remaining 80 after a mocked v3 profile transitioned from the certificate menu to resident-document selection. Returning home without a profile also left the root at a nonzero offset after the dock's layout changed.

**How to apply:** Treat screen-aware scroll reset and scroll-owner transitions as shared-SDK work. Prefer a public SDK mechanism keyed to the host's stable `screenId`; do not add host-only repeated `scrollTo` calls or CSS overrides.

With extra-large text and large controls on a short mobile viewport, lower keypad rows can start behind the fixed footer even when the menu itself scrolls correctly. A natural document swipe can reveal them; verify actual hit targets after scrolling rather than assuming visible DOM controls are touchable.

**Why:** Browser touch testing at 390×844 showed the resident-number screen needed a document scroll before its last keypad row could be tapped; the complete flow then succeeded.

**How to apply:** Test both the initial and scrolled positions on each long issuance screen, measure the true scroll owner, and report footer overlap separately from whether touch scrolling recovers access.

The additional-menu hint is SDK-owned. Keep certificate buttons registered in DOM order as menu actions and menu items, but allow the hint to overlap ordinary menu tiles; only fixed home, back, confirm, and QR dock controls belong in guidance-avoid regions. The SDK may still report `no-safe-space` in the default QR-dock layout when its candidate positions collide with the dock and footer.

**Why:** The user explicitly permits overlap with ordinary menu items so the hint can remain visible, while fixed navigation and confirmation controls must stay unobstructed. Browser testing at 390×844 showed the hint in 60/70/80% bottom-viewport modes, but the default layout had no safe placement because the QR dock and fixed footer blocked the SDK's candidate slots.

**How to apply:** For future menu screens, register the real list, scroll owner, and fixed controls accurately. Do not duplicate the hint in the host or remove real controls from avoidance regions to force it; report or address the safe-area limitation in the shared SDK.

Under accessibility profiles that activate layout correction, inserting a host notice/modal inside the SDK root can trigger its layout `MutationObserver` and reposition the active scroll owner. Keep the host notice mounted and toggle visibility/update a persistent text node instead of conditionally inserting it.

**Why:** In Replit Preview at 390×844 with extra-large text, large controls, high contrast, and bottom mode 80%, inserting the notice moved `.stage.scrollTop` from 640 to 323 and closing did not restore it. Instrumentation showed the SDK `createLayoutEnhancer` observer calling `correctLayout()` after the notice's child-list insertion; disabling that observer callback diagnostically prevented the shift, while `overflow-anchor:none` did not. Keeping the notice mounted and changing only text/style kept the scroll position unchanged.

**How to apply:** For overlays inside the SDK root, prefer a pre-mounted hidden host element and persistent text node so opening does not add/remove child nodes. Do not force-restore `scrollTop`; test modal open/close at a known position with the active accessibility profile.

In a 360×667 bottom-viewport layout, do not treat the stage's absolute maximum scroll position as proof that the last certificate is reachable. The final tile can sit just above the visible stage at that exact position, while an ordinary partial touch scroll can expose it and make it clickable.

**Why:** Browser testing with the shared SDK showed the last menu's hit target was clipped only at the computed maximum; a controlled touch scroll in the actual kiosk revealed and activated it without host CSS changes.

**How to apply:** Check the last tile's real bounds and `elementFromPoint` hit target during user-driven scrolling, not only at scrollTop zero or maximum. Report any fixed-region overlap separately and avoid a host layout workaround unless requested.

At wide desktop sizes, unsafe vertical centering can place an oversized kiosk shell above `.stage`'s scroll origin. `safe center` preserves centering when the shell fits and aligns it from the start when it does not. The SDK bottom-viewport mode already uses safe centering; the remaining issue is the host's normal desktop alignment.

**Why:** Actual Replit Preview measurements at 1440×900 found the unprofiled machine frame at y=-14.5 and the large-text v3-null header at y=-7.78 while `.stage.scrollTop` was 0. A one-property safe-alignment experiment moved the machine to y=50 and the header to y=104; the SDK-owned bottom modes already kept the header visible.

**How to apply:** At wide sizes, measure the whole host frame, header, and actual scroll owner in both normal and QR-profile states. Prefer safe alignment to offsets or repeated scroll calls, and keep SDK layout behavior shared rather than duplicating it in the host.

SDK v0.5.6 synchronizes QR v3 `viewportMode` to the existing QR-entry dock internally. Do not derive a second host `bottomViewportPercent`; keep an explicit developer override only when no QR profile is active.

**Why:** Replit Preview tests applied v3 null/60/70/80 modes through one dock node; the SDK updated viewport state without creating duplicate docks. `endSession()` returned to one default dock.

**How to apply:** Create one dock and let SDK profile application synchronize its viewport. Verify dock count and identity during profile changes, retain only the no-profile developer override, and confirm one default dock after session end.
