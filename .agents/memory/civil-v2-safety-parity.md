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

During Development testing, an expanded Universal v2 control panel can consume space in the main-menu flow and create apparent menu/dock overlap even when the customer-facing layout is safe.

**Why:** The panel's expanded height shifted the Civil G menu down by the same amount that distinguished a failing run from the earlier safe measurement.

**How to apply:** Measure and isolate Development test controls before changing business-content spacing; preserve the menu, footer, dock, and post-apply safety check.
