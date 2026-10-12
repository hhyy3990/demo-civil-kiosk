---
name: Browser input readiness
description: Reliable CDP automation of React-controlled forms.
---
After CDP `Input.insertText`, wait until the DOM value and dependent submit state reflect the update; do not rely on an immediate fixed delay.

**Why:** React-controlled inputs can update after the browser input event, so an early test assertion may see stale state and mistake it for an application failure.

**How to apply:** Poll the rendered value and button readiness before submitting a form in headless-browser tests.
