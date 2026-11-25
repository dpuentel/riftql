# T-101 — [Backlog v2] Git-Friendly JSON/YAML Workspace Sync

- **Status:** `BACKLOG`
- **Area:** Persistence / v2

## Scope
- Support mounting a local directory as a Git-friendly RiftQL workspace (similar to Bruno).
- Serialize collections, nested folders, requests, and non-secret environment definitions as deterministic, human-readable `.json` or `.yaml` files with clean diffs.
- Keep secrets in an untracked `.riftql.secrets.json` or local SQLite store excluded via `.gitignore`.
- Bi-directional file watcher to reload external `git pull` / branch switches automatically.
