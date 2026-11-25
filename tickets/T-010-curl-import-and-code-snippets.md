# T-010 — cURL Import & Code Snippet Generator

- **Status:** `IN_PROGRESS`
- **Area:** Features / Snippets

## Scope
- Shell-aware `curl-parser.ts`: quotes, line continuations, `-X`, `-H`, `-d`/`--data-raw`/`--data-urlencode`, `-F` (including `@filepath`), `-u`, `-A`, `-b`, `-k`, `-L`, `--url`, positional URL, and automatic GraphQL body recognition.
- `code-generators.ts`: generate ready-to-run snippets for `cURL`, `fetch`, `axios`, `Python (requests)`, and `HTTPie`, supporting both REST and GraphQL and toggling resolved vs `{{template}}` variables.
- `ImportCurlModal` + direct `onPaste` auto-import in the URL bar when pasting a `curl ...` command.
- `CodeSnippetModal` with language tabs, CodeMirror viewer, variable resolution switch, and copy feedback.

## Acceptance Criteria
- Comprehensive unit tests for `curl-parser` (15+ cases) and `code-generators` (all 5 targets across REST + GraphQL).
