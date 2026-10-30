---
name: Civil Production AI gate
description: Production v2 AI must remain separate from Development and blocked until central host policy registration is confirmed.
---

Civil Production layout AI is a separate server-only path from Development. Keep it default OFF, and require explicit Production enablement plus host-policy verification before any upstream call. Each explicit QR application event gets one fresh random event key; retransmissions reuse it, and a page refresh must not restore an event or automatically request another plan.

**Why:** the central Production allowlist is a separate control plane and may be empty while the host model is under local validation.

**How to apply:** before enabling the Civil Production relay, confirm central host registration and configure the Production origin and host token through Replit's secure environment flow. Keep the event key only in volatile QR-event state, scope dedupe to the signed session, and preserve QR accessibility if AI fails.
