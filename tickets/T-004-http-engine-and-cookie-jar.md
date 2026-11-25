# T-004 — Rust HTTP Engine, RFC Cookie Jar, Multipart Streaming & Cancellation

- **Status:** `DONE`
- **Area:** Backend / HTTP

## Scope
- `reqwest` + `tokio` HTTP executor supporting `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `HEAD`.
- Per-request/global SSL verification toggle, system proxy, timeout, manual redirect loop (up to `max_redirects`), and `CancellationToken` abort registry.
- RFC 6265 Cookie Jar (`parse_set_cookie_header`, `match_cookies_for_url`, `build_cookie_header`) storing/resending cookies by domain/path across requests and redirects, with global + per-request toggle.
- Streaming `multipart/form-data` file uploads via `tokio::fs::File` + `ReaderStream` + `mime_guess`.
- Response classification (`text`, `image`, `binary`, `large-text` > 5 MB preview) + bounded response body cache + `save_response_body_to_file`.

## Acceptance Criteria
- Unit tests for RFC cookie matching/parsing.
- Local `axum` integration tests covering all HTTP methods, multipart file bytes, cookie round-trips & toggle off, redirects, timeouts, cancellation, binary cache & large-payload truncation.
