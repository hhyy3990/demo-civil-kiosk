---
name: Civil v2 safety parity
description: Keep local Fake and central Universal v2 host-safety decisions consistent.
---

Use the same host-eligibility validator for physical DOM safety in local Fake and central relay paths. Central-only viewport and accessibility-profile restrictions remain additional gates; they must not weaken or replace the common physical checks.

**Why:** A parity review found the local Fake could approve a layout with the QR dock hidden while the central path rejected it. Separate predicates allowed the test route to bless a host state the central route would not accept.

**How to apply:** When either v2 path changes, update and test the shared eligibility check first, then keep each path’s explicitly scoped viewport/profile gates separate.

Treat a valid plan and matching hashes as necessary, not sufficient: after React applies a preset, remeasure the rendered menu against the footer and fixed QR dock and hit-test visible actions. On failure, remove only the layout preset and retain the QR accessibility profile.

**Why:** A real 1080×1920 Civil G-profile browser run produced a valid one-column plan, but the rendered menu intersected the fixed QR dock and the last item was not hit-testable.

**How to apply:** Keep this post-apply physical check in both local Fake and central-plan application paths; do not widen profile eligibility based on contract validation alone.

In an isolated 1080×1920 G-profile run, the first DOM mutation after selecting `reserved-safe-list` still intersected the QR dock and left the last items out of the hit-testable viewport. After the existing two-animation-frame remeasurement, the layout settled: all 18 actions were hit-testable, the minimum button height was 50.6px, and the menu no longer intersected the dock.

**Why:** The first render is transient while the accessibility layout reflows; treating that geometry as final would incorrectly roll back a layout that becomes safe.

**How to apply:** Preserve the post-apply settling and remeasurement. Close the QR success notice before testing hit targets, and do not use the immediate attribute-mutation frame as the final safety result.

During Development testing, an expanded Universal v2 control panel can consume space in the main-menu flow and create apparent menu/dock overlap even when the customer-facing layout is safe.

**Why:** The panel's expanded height shifted the Civil G menu down by the same amount that distinguished a failing run from the earlier safe measurement.

**How to apply:** Measure and isolate Development test controls before changing business-content spacing; preserve the menu, footer, dock, and post-apply safety check.

Do not run the menu hit-test while the existing QR-success confirmation overlay is still open. Wait for that overlay to close, then use the existing v2 safety path unchanged.

**Why:** The overlay intentionally covers every menu action; the fail-closed hit-test correctly rejected the layout even though the menu, footer, and QR dock geometry was otherwise safe.

**How to apply:** For QR-triggered Development layout requests, defer planning until the host confirmation notice is dismissed. Do not bypass hit-testing or make the overlay click-through.

When `.stage` is the scroll viewport ending at the fixed QR dock, the full certificate-grid rectangle can extend behind the dock even though `.stage` clips that content and later actions are reachable by scrolling. A raw grid-to-dock intersection is not, by itself, proof that visible menu content covers the dock.

**Why:** In G-profile browser checks, the stage ended at the dock's top edge while the full one-column grid extended below it; scrolling exposed the last 50px+ action for hit-testing. The current whole-rectangle check still rejected the mobile-emulated case.

**How to apply:** Distinguish actual visible overlap from off-viewport scroll content. Any safety-predicate change needs explicit approval and must retain final-action reachability and minimum-touch checks.
