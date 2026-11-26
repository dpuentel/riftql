# T-101 — Git-Friendly JSON Workspace Sync

- **Status:** `DONE`
- **Area:** Persistence / v2

## Scope
- Support mounting a local directory (and optionally initializing, connecting, or cloning a Git repository) as a Git-friendly RiftQL workspace, toggled on/off anytime from **Settings → Git Sync**.
- Explicit migration workflows between local SQLite and the folder workspace (**Migrate SQLite → Folder**, **Import Folder → SQLite**, **Clone Git Repo & Enable**), plus disabling back to SQLite-only mode without data loss.
- Serialize collections, nested folders, saved requests, and non-secret environment definitions into deterministic, human-readable `.json` files (`riftql.workspace.json`, `environments/`, `collections/<slug>--<hash>/`) with clean Git diffs and stale-file pruning.
- Isolate `isSecret` variable values in local SQLite + gitignored `.riftql.secrets.json` (auto-managed `.gitignore` excludes secrets and `*.db*`), preserving local secrets across `git pull` / disk reloads.
- Automatic App → Disk sync on workspace mutations + background file watcher (`riftql://git-sync-updated`) to reload external edits / `git pull` / branch switches automatically, plus built-in Git Init, Pull, Commit, and Commit & Push actions.
