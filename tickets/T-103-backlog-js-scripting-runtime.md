# T-103 — [Backlog v2] JavaScript Pre-Request & Post-Response Scripting Runtime

- **Status:** `BACKLOG`
- **Area:** Scripting / v2

## Scope
- Embed lightweight sandboxed JS runtime (e.g., QuickJS / Boa in Rust) for pre-request and post-response hooks.
- Provide `rift.env.get/set`, `rift.collection.get/set`, `rift.request`, `rift.response`, and `rift.test(name, fn)` assertions.
- Render Test Results tab inside `ResponsePane` with pass/fail counts and console logs.
