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

With extra-large text and large controls, lower keypad rows can be obscured by fixed footer controls even when menu scrolling works. Distinguish this from guide-overlay overlap: the guide may be safely suppressed while a natural scroll is still needed to expose the keypad.

**Why:** Browser hit-testing found a keypad button intercepted by the fixed footer while the registered `.stage` scroll area was at its initial position. A natural scroll moved the button into view and a real pointer click succeeded, although the SDK's scroll-space correction reported failure.

**How to apply:** Measure the actual scroll owner and hit targets before and after a natural gesture. Report fixed-footer occlusion separately from guide suppression; if the adapter correctly registers the footer and scroll area, do not add host CSS or repeated `scrollTo` workarounds for a shared-SDK correction failure.

The additional-menu hint is SDK-owned. Keep certificate buttons registered in DOM order as menu actions and menu items, but allow the hint to overlap ordinary menu tiles; only fixed home, back, confirm, and QR dock controls belong in guidance-avoid regions. The SDK may still report `no-safe-space` in the default QR-dock layout when its candidate positions collide with the dock and footer.

**Why:** The user explicitly permits overlap with ordinary menu items so the hint can remain visible, while fixed navigation and confirmation controls must stay unobstructed. Browser testing at 390×844 showed the hint in 60/70/80% bottom-viewport modes, but the default layout had no safe placement because the QR dock and fixed footer blocked the SDK's candidate slots.

**How to apply:** For future menu screens, register the real list, scroll owner, and fixed controls accurately. Do not duplicate the hint in the host or remove real controls from avoidance regions to force it; report or address the safe-area limitation in the shared SDK.

Under accessibility profiles that activate layout correction, inserting a host notice/modal inside the SDK root can trigger its layout `MutationObserver` and reposition the active scroll owner. Keep the host notice mounted and toggle visibility/update a persistent text node instead of conditionally inserting it.

**Why:** In Replit Preview at 390×844 with extra-large text, large controls, high contrast, and bottom mode 80%, inserting the notice moved `.stage.scrollTop` from 640 to 323 and closing did not restore it. Instrumentation showed the SDK `createLayoutEnhancer` observer calling `correctLayout()` after the notice's child-list insertion; disabling that observer callback diagnostically prevented the shift, while `overflow-anchor:none` did not. Keeping the notice mounted and changing only text/style kept the scroll position unchanged.

**How to apply:** For overlays inside the SDK root, prefer a pre-mounted hidden host element and persistent text node so opening does not add/remove child nodes. Do not force-restore `scrollTop`; test modal open/close at a known position with the active accessibility profile.

In a 360×667 bottom-viewport layout, do not treat the stage's absolute maximum scroll position as proof that the last certificate is reachable. The final tile can sit just above the visible stage at that exact position, while an ordinary partial touch scroll can expose it and make it clickable.

**Why:** Browser testing with the shared SDK showed the last menu's hit target was clipped only at the computed maximum; a controlled touch scroll in the actual kiosk revealed and activated it without host CSS changes.

**How to apply:** Check the last tile's real bounds and `elementFromPoint` hit target during user-driven scrolling, not only at scrollTop zero or maximum. Report any fixed-region overlap separately and avoid a host layout workaround unless requested.

At 390×844 with large text, large controls, and high contrast, layout diagnostics can still flag certificate tiles 15–18 beneath the QR dock/footer. The SDK's grid, action-group, and scroll-space corrections may roll back, while a real wheel scroll still reaches and activates tile 18.

**Why:** Replit Preview measurements showed nine remaining diagnostic issues after the attempted corrections, but the scroll hint disappeared at the bottom and a real click on the final certificate opened its demo notice.

**How to apply:** Report initial-position diagnostics and post-scroll reachability separately. A successful final-tile click does not mean the initial overlaps were corrected, and rolled-back SDK strategies should not be reported as applied fixes.

At wide desktop sizes, unsafe vertical centering can place an oversized kiosk shell above `.stage`'s scroll origin. `safe center` preserves centering when the shell fits and aligns it from the start when it does not. The SDK bottom-viewport mode already uses safe centering; the remaining issue is the host's normal desktop alignment.

**Why:** Actual Replit Preview measurements at 1440×900 found the unprofiled machine frame at y=-14.5 and the large-text v3-null header at y=-7.78 while `.stage.scrollTop` was 0. A one-property safe-alignment experiment moved the machine to y=50 and the header to y=104; the SDK-owned bottom modes already kept the header visible.

**How to apply:** At wide sizes, measure the whole host frame, header, and actual scroll owner in both normal and QR-profile states. Prefer safe alignment to offsets or repeated scroll calls, and keep SDK layout behavior shared rather than duplicating it in the host.

SDK v0.5.6 synchronizes QR v3 `viewportMode` to the existing QR-entry dock internally. Do not derive a second host `bottomViewportPercent`; keep an explicit developer override only when no QR profile is active.

**Why:** Replit Preview tests applied v3 null/60/70/80 modes through one dock node; the SDK updated viewport state without creating duplicate docks. `endSession()` returned to one default dock.

**How to apply:** Create one dock and let SDK profile application synchronize its viewport. Verify dock count and identity during profile changes, retain only the no-profile developer override, and confirm one default dock after session end.

For browser scroll tests, position wheel input inside the measured active scroll owner's bounds rather than at the viewport edge.

**Why:** At 390px viewport width the centered kiosk stage was narrower than the viewport, so a test wheel sent to `innerWidth - 4` missed the stage and falsely looked like a scroll failure.

**How to apply:** Read the active owner's `getBoundingClientRect()` and send wheel/touch input within that rectangle; verify both `scrollTop` and the target's hit-test after scrolling.

When a shared-SDK hint changes position during user scrolling, first verify the host's real scroll owner, fixed controls, and avoidance regions. If those are correctly registered, treat placement instability as a shared-SDK issue; do not pin the hint with host CSS or repeated scroll calls.

**Why:** A valid `.stage` scroll-area registration still produced a large hint jump during real wheel input, showing that a host-only workaround would conceal a cross-kiosk SDK defect.

**How to apply:** Reproduce after the screen layout settles, capture the hint and obstacle rectangles before and after scrolling, and stop host edits until the shared SDK behavior is corrected.
