# T-102 — Multi-Format Importer (Altair GraphQL, Postman v2.1, Insomnia & OpenAPI 3.x / Swagger)

- **Status:** `DONE`
- **Area:** Importers / v2

## Scope
- Importers for **Altair GraphQL Client** (`.agq` query/window files, `.agc` collections with nested subcollections & queries, and `.agx` environment bundles).
- Importers for **Postman Collection v2.0 / v2.1** + **Postman Environment** JSON files (mapping nested folders, auth inheritance, variables including `secret` flag, query params without URL duplication, and raw/JSON/XML/HTML/urlencoded/form-data/GraphQL bodies).
- Importer for **OpenAPI 3.0 / 3.1** & **Swagger 2.0** JSON specs generating structured RiftQL collections grouped by `tags`, extracting `baseUrl`, `securitySchemes`/`securityDefinitions`, path/query/header parameters, and synthesized JSON example payloads with cycle-safe `$ref` resolution.
- Importer for **Insomnia v4** export JSON (`workspace`, nested `request_group`, REST/GraphQL `request`, and `environment` resources).
- Resizable **Import Collection / Spec** modal (`ImportCollectionModal`) accessible from Sidebar, Collection/Folder context menus (*Import Into Collection/Folder…*), Command Palette, and Settings → Data, with auto-detection, live tree preview, destination selector (create new collection or merge into any existing collection/folder with optional subfolder wrapping), and duplicate-safe fresh ID generation.

## Verification
- `src/lib/__tests__/importers.test.ts` (Altair `.agq`/`.agc`/`.agx`, Postman v2.1 + Env, Insomnia v4, OpenAPI 3.0 & Swagger 2.0 `$ref` + cycle guard, destination builders)
- `src/components/modals/__tests__/ImportCollectionModal.test.tsx` (auto-detection, new collection, existing collection/folder target, Postman environment import, validation errors)
- `pnpm typecheck`, `pnpm test`, `pnpm build`, and `cargo test --manifest-path src-tauri/Cargo.toml --offline`
