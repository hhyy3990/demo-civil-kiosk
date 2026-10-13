---
name: Smart guide step contract
description: Shared SDK step IDs, idle timer semantics, and bottom-viewport guide placement behavior.
---

Pass a stable host-owned `stepId` for business stages whose React state changes without changing the user's task. The SDK can then update the guide content without restarting the timer merely because `setGuideState()` ran again. User pointer interaction still intentionally resets the idle timer; distinguish that behavior from rerender-driven timer resets when testing.

**Why:** The kiosk's option and copy-count updates rerun guide state, while a direct pointerless state update allows the SDK's step continuity behavior to be tested independently of its idle-on-interaction behavior.

**How to apply:** Keep `stepId` semantic and value-free. When checking timer preservation, account for or isolate SDK interaction events rather than interpreting pointerdown resets as a failed same-step contract.

In a short viewport with bottom-viewport mode, a smart guide targeting a control in the fixed footer may be omitted if the SDK cannot find a safe position inside the active viewport. This can occur even when the guide appears on the home screen under the same profile.

**Why:** At 360×667 with a 60% profile, the active screen area measured about 301px high; the SDK displayed the home guide but did not place guides for issuance steps whose emphasized actions were in the footer.

**How to apply:** Verify guidance on issuance screens under the same viewport mode, inspect the SDK's safe-area decision, and keep the limitation in the shared SDK rather than adding host-specific popup placement or timer workarounds.
