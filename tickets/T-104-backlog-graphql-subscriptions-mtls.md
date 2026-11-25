# T-104 — [Backlog v2] GraphQL Subscriptions (WS/SSE) & Custom mTLS Certificates

- **Status:** `BACKLOG`
- **Area:** Protocol / v2

## Scope
- Support GraphQL Subscriptions over `graphql-ws` (`ws://`/`wss://`) and Server-Sent Events (`text/event-stream`) with live streaming message log in `ResponsePane`.
- Support per-host / per-collection mTLS client certificates (`.pem`, `.crt`/`.key`, `.p12`/`.pfx` with optional passphrase) and custom CA certificate bundles in `reqwest`.
