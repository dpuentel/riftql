# Collections, Folders, Inheritance & Variables

RiftQL organizes requests locally inside SQLite (and optionally mirrors them into Git-diffable JSON files).

---

## Collections & Nested Folders

- **Arbitrary nesting:** Create collections and nest folders to any depth from the sidebar **`+`** / **`Folder+`** actions or context menus.
- **Inline renaming:** Double-click any collection, folder, or saved request (or click its pencil icon) to rename inline; renaming a saved request updates open tabs automatically.
- **Confirm-to-delete:** Deleting a collection or folder prompts an inline confirmation and cascades cleanly while detaching any open tabs cleanly rather than closing them unexpectedly.
- **Drag-and-drop reorganization:** Drag saved requests or entire folders across folders or across different collections. Built-in cycle guards prevent dropping a folder into itself or one of its own descendants.
- **Alphabetical sorting:** Click the **A-Z** button on any collection or folder hover tray (or right-click → **Sort Requests A → Z** / **Z → A**) to persist alphabetical ordering for requests in that container without disturbing other folders.

---

## Base URL & Auth Inheritance

Both **Collections** and **Folders** have a settings modal (*Sliders* icon or right-click → **Collection Settings & Auth** / **Folder Settings / Auth**):

### Base URL Inheritance
- Composes top-down along the hierarchy: `Collection Base URL` → `Parent Folder Base URL` → `Subfolder Base URL` → `Request URL`.
- **Relative segments append cleanly:** For example, Collection `https://api.example.com` + Folder `/v2` + Request `/orders` resolves to `https://api.example.com/v2/orders`.
- **Full URLs override ancestors:** Any folder `Base URL` or request URL starting with `http://` or `https://` replaces ancestor Base URLs instead of appending.
- Supports `{{variables}}` at any level (e.g., `{{host}}/api`).

### Auth Inheritance
- By default, folders and saved requests use **`Inherit`** (`{ type: 'inherit' }`), walking upward through parent folders to the collection until a concrete Auth configuration (`Bearer`, `Basic`, `API Key`, or `None`) is found.

---

## Environments, Variables & Secrets

Open the **Environment Manager** (`Ctrl/Cmd+E`, top-right environment dropdown → **Manage Environments…**, or the sidebar **Envs** tab):

### Variable Precedence
When resolving `{{varName}}` across URL, query params, headers, auth, JSON/raw/form bodies, GraphQL queries, or GraphQL variables, RiftQL applies:

1. **Active Environment** (highest priority — selected in header bar / Command Palette / Sidebar)
2. **Collection Variables** (configured per collection under Collection Settings)
3. **Global Environment** (always present, cannot be deleted, fallback values shared across all collections)

Hovering or inspecting variables highlights resolved values and warns about unresolved `{{placeholders}}`.

### Dynamic Built-in Variables
Use these placeholders anywhere without defining them:
- `{{$uuid}}`: Random UUID v4
- `{{$timestamp}}`: Current Unix epoch seconds
- `{{$isoTimestamp}}`: Current ISO-8601 UTC timestamp
- `{{$randomInt}}`: Random integer (`0`–`9999`)

### Secret Variables
- Toggle the **Lock** icon on any Global, Environment, or Collection variable to mark it as **`isSecret`**.
- Secret values are masked (`••••`) by default in UI inputs until explicitly revealed.
- Secret values are automatically stripped (`""`) on **Workspace JSON Export** and in tracked **Git Sync JSON files** so credentials are never shared or committed.

### Bulk Creation Across Environments
Inside the **Environment Manager**:
- **Add to All Envs:** Opens an inline bar to define a key, default value, and secret flag once and create it across `Global` plus every custom environment (skipping any environment that already defines that key so existing overrides stay untouched).
- **Copy to All Other Environments:** Per-row action button on any variable row that propagates that variable to all other environments where the key does not exist yet.

---

## Tabs, Dirty State & Request History

- **Multi-tab workspace:** Open multiple REST and GraphQL tabs (`Ctrl/Cmd+T`, `Ctrl/Cmd+W`, `Ctrl+Tab` / `Ctrl+Shift+Tab`), duplicate tabs, or reopen saved requests (focuses existing tab if already open).
- **Accurate dirty tracking:** Blue unsaved indicator dot appears only when a request actually diverges from its saved state — switching cleanly between tabs never marks tabs dirty.
- **Session persistence:** Open tabs and active tab selection restore automatically on app restart.
- **History:** Every executed request is logged in SQLite (up to the 200 most recent entries, omitting response bodies larger than 500 KB or binary responses), grouped into **Today**, **Yesterday**, and **Older**, and filterable from the sidebar **History** tab.
