---
name: Temporary Replit test ports
description: Clean up persistent port mappings created during isolated Development browser tests.
---

Temporary Vite servers on alternate ports may leave corresponding `[[ports]]` entries in `.replit`, even after the processes stop.

**Why:** an isolated browser test left additional port mappings in the project configuration.

**How to apply:** after alternate-port tests, stop the temporary servers, inspect the `.replit` diff, and remove only test-only mappings through Replit's validated configuration replacement flow.
