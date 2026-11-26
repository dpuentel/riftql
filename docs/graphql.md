# GraphQL & Schema Auto-Discovery

Switching a tab's method/protocol selector to **`GQL`** (or opening any saved GraphQL request or Altair `.agq` import) activates RiftQL's dedicated GraphQL workspace powered by **CodeMirror 6**, **`cm6-graphql`**, and **`graphql`**.

---

## Query & Variables Editor

- **Schema-aware authoring:** When a schema has been fetched for the endpoint, the Query editor provides field/argument autocomplete, inline type linting, and hover diagnostics.
- **Multi-operation support:** If your document contains multiple named operations (`query ...`, `mutation ...`, `subscription ...`), pick which operation to execute from the **Operation** selector.
- **Query formatting:** Press `Ctrl/Cmd+Shift+F` (or click **Format**) to format your GraphQL query AST cleanly.
- **JSON Variables editor & formatter:**
  - Dedicated CodeMirror JSON editor for query variables.
  - Includes an inline **Format** button and an **`Invalid JSON`** badge indicator whenever syntax needs fixing.
  - Pressing `Ctrl/Cmd+Shift+F` while focus is inside the Variables editor formats only Variables JSON; pressing it inside the Query editor formats both Query and Variables cleanly.
- **Resizable layout:** Drag the splitters between Query, Variables, and the **Schema Docs** side panel (sizes persist in `localStorage`).

---

## Introspection & Schema Docs Explorer

1. Click **Fetch Schema** in a GraphQL tab. RiftQL sends the standard introspection query (`IntrospectionQuery`) using the request's effective URL, inherited Auth, active Environment variables, headers, cookies, and SSL/timeout settings.
2. Loaded schemas are cached per resolved endpoint in memory (`useSchemaStore`) so switching tabs or opening docs is instant.
3. Click **Docs** to toggle **Schema Docs**:
   - Browse root **`Query`**, **`Mutation`**, and **`Subscription`** types, plus object/input/interface/union/enum/scalar definitions.
   - Drill into field return types and arguments with clickable breadcrumb navigation (`Query → users → User`).
   - Search across all type names and field names simultaneously.
   - **Insert Operation into Editor:** Click **`+`** next to any root `Query`, `Mutation`, or `Subscription` field to generate a ready-to-run operation (with selection sets up to depth 2, union fragments, and cyclic type guards) and merge missing starter variables without overwriting your existing variable values.

---

## Schema Auto-Discovery (`AUTO-DISCOVERED`)

Whenever a **Collection** or **Folder** has an effective **Base URL** assigned (directly or inherited from ancestors), RiftQL can inspect the remote GraphQL schema and scaffold every missing operation automatically.

### Opening Schema Auto-Discovery
- Hover any Collection or Folder with a Base URL in the sidebar and click the ✨ **Discover GraphQL Schema** icon, **or**
- Right-click the Collection or Folder and choose **Discover GraphQL Schema…**.

### How It Works
1. **Endpoint & Auth inheritance:**
   - Starts from the collection/folder's effective **Base URL** and **Auth**, resolving `{{variables}}` from `Active Environment > Collection > Global`.
   - If the container's Base URL is only a host prefix (for example `https://api.example.com`), enter an optional suffix such as `/graphql` in the modal and click **Scan Schema**.
2. **AST-based deduplication (rename-safe):**
   - Instead of comparing request titles (which breaks when you rename or organize requests), RiftQL parses the GraphQL query AST of every GraphQL request across the target collection/folder **and all its subfolders** (including fragment spreads and inline fragments).
   - Operations already invoked anywhere inside that scope are marked **`Covered (<request name>)`**, even if you moved or renamed them.
3. **Preview, Filter & Depth Control:**
   - Search operations by name or description.
   - Toggle **Queries**, **Mutations**, and **Hide existing**; choose selection-set nesting depth (`1`, `2`, or `3`; default `2`); or click **Select All New** / **Clear**.
4. **Clean generation into `AUTO-DISCOVERED`:**
   - Creates (or reuses) a direct subfolder named **`AUTO-DISCOVERED`** inside the scanned collection/folder.
   - Appends the selected operations as GraphQL requests with `auth: { type: 'inherit' }` and relative/empty `url` (or your specified subpath) so they continue inheriting the container's Base URL and Auth.
   - From there, drag and drop the generated requests into your domain folders (`Users`, `Billing`, etc.) at your own pace — subsequent scans will remember they are already covered.
