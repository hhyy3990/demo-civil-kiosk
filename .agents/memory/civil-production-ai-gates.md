---
name: Civil Production AI gate
description: Production v2 AI must remain separate from Development and blocked until central host policy registration is confirmed.
---

Civil Production layout AI is a separate server-only path from Development. Keep it default OFF, and require explicit Production enablement plus host-policy verification before any upstream call. Do not treat a locally generated model or Development success as central Production allowlist approval.

**Why:** the central Production allowlist is a separate control plane and may be empty while the host model is under local validation.

**How to apply:** before enabling the Civil Production relay, confirm central host registration and configure the Production origin and host token through Replit's secure environment flow; preserve QR accessibility if AI fails.
