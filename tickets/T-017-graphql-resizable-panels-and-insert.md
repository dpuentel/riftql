# T-017 — Resizable GraphQL Panels & Insert Operations from Schema Docs

- **Status:** `DONE`
- **Area:** UI / GraphQL

## Scope
- Add `buildOperationFromField`, `appendOperationToDocument`, and `mergeVariablesJson` in `src/lib/graphql.ts` to synthesize formatted GraphQL queries/mutations/subscriptions with args, default variable JSON templates, union inline fragments, and cycle-safe nested selection sets.
- Add `+ Add` buttons on root `Query`, `Mutation`, and `Subscription` fields in `SchemaDocsPanel` (both in type view and search results) to insert operations directly into the editor and merge variable templates.
- Replace fixed GraphQL panel dimensions with draggable split separators in `GraphQLEditor` (Variables height + Schema Docs width) and `AppShell` (Sidebar width), persisted in `localStorage`.

## Acceptance Criteria
- Unit tests cover query/mutation/union/scalar generation, recursive cycle guard, duplicate operation name suffixing, and variable merging.
- Component tests verify `SchemaDocsPanel` `+ Add` buttons and `GraphQLEditor` resize separators & operation insertion.
