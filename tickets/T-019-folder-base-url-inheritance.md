# T-019 — Per-Folder & Collection Base URL Inheritance

- **Status:** `DONE`
- **Area:** Persistence / Request Builder / GraphQL

## Scope
- Add idempotent SQLite migration V2 (`collections.base_url` & `folders.base_url`) with `#[serde(default)]` models, upsert/list support, and workspace export/import preservation.
- Add `src/lib/base-url.ts` (`combineBaseAndRequestUrl`, `resolveEffectiveBaseUrl`, `resolveRequestUrl`) walking nested folders -> collection, appending relative child segments, supporting `{{variables}}`, and stopping when an explicit `http(s)://` URL overrides ancestors.
- Wire Base URL resolution into `sendTabRequest`, GraphQL introspection (`useSchemaStore` + `GraphQLEditor`), `generateCodeSnippet` + `CodeSnippetModal`, and `CollectionSettingsModal` (Default / Base URL input + live composed preview).
- Show live inheritance banner and effective URL inside `RequestPane` and a `Link2` indicator on Sidebar folders/collections with a configured Base URL.

## Acceptance Criteria
- Rust DB tests verify `base_url` persistence on collections/folders and export/import roundtrip.
- Vitest tests cover `base-url.ts`, `sendTabRequest` URL combination, and `RequestPane` live preview.
