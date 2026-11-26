# Git Sync & Local Storage

RiftQL is **local-first** by design: your entire workspace lives on disk in SQLite (`riftql.db`), with optional folder-based Git synchronization so teams can version-control collections, folders, requests, and non-secret environments using standard Git workflows.

---

## Local SQLite Storage

RiftQL persists `collections`, `folders`, `saved_requests`, `environments`, `cookies`, `history_entries`, `session_tabs`, and `app_settings` inside a single SQLite database (`riftql.db`).

### Default Data Directories
- **Linux (`.AppImage` / `.deb` / `.rpm`):** `~/.local/share/com.riftql.app/` (or `$XDG_DATA_HOME/com.riftql.app/`)
- **Windows:** `%APPDATA%\com.riftql.app\`
- **macOS:** `~/Library/Application Support/com.riftql.app/`

> [!NOTE]
> On Linux AppImage builds, RiftQL sets the GTK app ID (`com.riftql.app`) and registers `~/.local/share/applications/com.riftql.app.desktop` plus hicolor PNG icon at startup so GNOME/Ubuntu docks display the RiftQL icon properly.

### Changing the Data Directory
Open **Settings → Data → Local Data Directory** to:
- View or copy your active storage folder and `riftql.db` path.
- Choose a custom folder (**Change Folder…**), with an optional checkbox to copy your existing `riftql.db` if the destination does not have one yet.
- Restore the OS default location anytime (**Reset to Default**). Custom directory overrides are saved in `storage-config.json` inside the default app data directory.

### JSON Workspace Backup
In **Settings → Data**, you can also export (`Export Workspace JSON`) or import (`Import Workspace JSON`) full RiftQL snapshots (`version: 1`). All variables marked `isSecret` have their values stripped (`""`) before export.

---

## Git-Friendly Workspace Sync

Enable or disable folder sync anytime in **Settings → Git Sync** (your data stays safe in SQLite if you switch back to **SQLite Only**).

### Tracked JSON Layout
RiftQL writes deterministic, alphabetically sorted, Git-diffable JSON files (avoiding noisy timestamp churn on unchanged items):

```text
<sync-folder>/
  .gitignore
  riftql.workspace.json
  environments/
    global.json
    <env-slug>--<hash>.json
  collections/
    <collection-slug>--<hash>/
      collection.json
      requests/
        <request-slug>--<hash>.json
      folders/
        <folder-slug>--<hash>/
          folder.json
          requests/...
          folders/...
```

### Secrets Architecture (No `.env` File)
RiftQL does **not** use plaintext `.env` files in the Git repository:
- Any Environment or Collection variable marked **`isSecret`** has its value stripped (`""`) in tracked JSON files inside `environments/` and `collections/`.
- Real secret values remain **local-only** in your SQLite database (`riftql.db`) and are mirrored locally inside `<sync-folder>/.riftql.secrets.json`, which RiftQL automatically adds to `.gitignore` (alongside `*.db`, `*.db-wal`, `*.db-shm`).
- When pulling updates from Git or reloading disk files, RiftQL preserves each developer's local secret values automatically without overwriting them with empty strings.
- *Best practice:* Reference tokens via `{{api_token}}` inside Auth/Headers instead of hardcoding credentials directly inside requests.

### Migration & Activation Modes
When enabling Git Sync under **Settings → Git Sync**:
1. **Migrate SQLite → Folder:** Exports your current SQLite workspace into the selected folder (optionally running `git init` and setting `origin`).
2. **Import Folder → SQLite:** Loads existing RiftQL workspace JSON files from an existing folder/repo into SQLite.
3. **Clone Git Repo:** Clones a remote Git repository URL into an empty folder, initializes `.gitignore`, and imports any existing workspace files (or exports your SQLite workspace if the repo was empty).

### Git Authentication (SSH & HTTPS)
- **SSH (`git@host:org/repo.git`):** Uses your system SSH keys/agent directly with zero extra configuration.
- **HTTPS (`https://...`):** When entering an `https://` URL (or clicking **HTTPS credentials…**), you can supply a **Username** and **Personal Access Token / Password**:
  - Credentials are stored locally in `<app-data-dir>/git-sync-credentials.json` (`0o600` file permissions on Unix), **never** inside `.git/config` or the synced workspace folder.
  - Supplied ephemerally to `git` per operation (`-c credential.helper=` reading process environment variables).

---

## Auto-Sync, Auto-Push & Auto-Fetch

Once Git Sync is enabled, three layered automation workflows are available:

### 1. Auto-Sync Changes to Folder & ~2s Disk Watcher
- **Auto-Sync Changes to Folder** (enabled by default): automatically exports updated JSON files whenever you edit collections, folders, requests, or environments.
- **Disk Watcher:** Polls your sync directory every **2 seconds** using a content fingerprint. External changes (`git pull`, `git checkout`, editor edits) reconcile into SQLite and reload open tabs automatically.

### 2. Auto-Commit & Push
- Toggle **Auto-Commit & Push Changes** inside **Settings → Git Sync** (requires Auto-Sync Changes to Folder enabled and an `origin` remote configured).
- After local mutations settle for a quiet delay (**`10s`**, **`15s` default**, **`30s`**, or **`60s`**), a background thread groups edits into a single commit (`chore(riftql): auto-sync workspace`) and pushes to `origin`.
- The sidebar footer pill briefly pulses (`Pushing…`) while pushing.
- **Safe divergence handling:** RiftQL never force-pushes. If `origin` rejects a push (`non-fast-forward`), auto-push pauses for that state, fetches incoming commits, and notifies you so you can pull/rebase safely.

### 3. Periodic Auto-Fetch & Remote Update Notifications
- Toggle **Auto-Fetch Remote Updates** and configure:
  - **Check interval:** `1 min`, `5 min` (default), `15 min`, `30 min`, or `60 min`.
  - **Snooze duration:** `15 min`, `30 min` (default), `60 min`, or `2 hours`.
- In the background, RiftQL runs `git fetch origin --prune` silently (if you are offline or off-VPN, no intrusive error popups interrupt your work — status only updates discreetly in Settings).
- When incoming commits exist on `origin`, a persistent **Sonner-style notification** appears in the bottom-right corner with:
  - **View & Pull…**: opens the **Remote Updates** modal listing incoming commits (hash, author, message, relative time).
  - **Later (`Xm`)**: snoozes notifications for your configured snooze window.
  - **Mute**: silences automatic remote update popups for the rest of the current session.
- **Pull options in the Remote Updates modal:**
  - Clean local state: **Pull Now** (`git pull --ff-only`).
  - Pending local changes or ahead commits detected: warns clearly and offers **Pull (Rebase & Autostash)** (`git pull --rebase --autostash`).
- Even when snoozed or muted, an **`↓N`** badge stays visible and clickable next to the branch name in the Sidebar footer so you can inspect and pull incoming commits whenever ready, alongside **Fetch Now**, **Git Pull**, **Commit**, and **Commit & Push** in **Settings → Git Sync**.
