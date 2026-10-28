---
name: Civil v2 safety parity
description: Keep local Fake and central Universal v2 host-safety decisions consistent.
---

Use the same host-eligibility validator for physical DOM safety in local Fake and central relay paths. Central-only viewport and accessibility-profile restrictions remain additional gates; they must not weaken or replace the common physical checks.

**Why:** A parity review found the local Fake could approve a layout with the QR dock hidden while the central path rejected it. Separate predicates allowed the test route to bless a host state the central route would not accept.

**How to apply:** When either v2 path changes, update and test the shared eligibility check first, then keep each path’s explicitly scoped viewport/profile gates separate.
