# Architecture

**English** · [Italiano](../it/architecture.md) · [简体中文](../zh-CN/architecture.md)

Partly is a local-first desktop-style web app. It uses the browser for the UI,
Python's standard library for the local HTTP API, and `data.json` as its
human-readable persistence layer. There is no build step or runtime package
installation requirement.

## Frontend

`index.html` is the document shell. It loads the CSS manifest in `style.css`
and the native ES module entry point in `app.js`.

| Module | Responsibility |
| --- | --- |
| `js/domain.js` | Product normalization, store detection, migration, and OCR text parsing |
| `js/activity-log.js` | Browser activity reporting, log window behavior, and lifecycle signals |
| `js/image-recognition.js` | Screenshot preview, Gemini request, and local OCR orchestration |
| `js/price-chart.js` | Price chart rendering and price-history editing |
| `js/action-dialog.js` | Shared confirmation and field-editing dialog, cancellation, and event cleanup |
| `js/saved-collections.js` | Watchlist and trash card rendering |
| `app.js` | Application state, page rendering, form submission, and event coordination |

Styles are grouped by responsibility under `styles/`. The import order in
`style.css` is intentional: responsive rules and feature overrides follow the
base rules they refine.

## Local server

`server.py` is the launcher entry point. The `partly_server` package contains
the HTTP handler, path and port configuration, logging setup, and the small
amount of thread-safe runtime state shared by request handlers. It uses only
the Python standard library.

The server binds to `127.0.0.1`. `/api/data` reads and writes the three saved
collections; writes use a temporary file followed by an atomic replace.
`/api/log` receives browser activity, `/api/heartbeat` supports lifecycle
recovery, and `/api/close` signals an intentional app-window close. Screenshot
recognition uses `/api/extract-image` only when AI assist is enabled.

For the detailed Python configuration, API behavior, `.env` setup, and Windows
launcher chain, see [Python server and Windows launcher](python-and-windows-launcher.md).

## Change boundaries

- Keep persisted shape changes compatible with `migrate()` and document them.
- Keep browser state and API responses plain JSON so `data.json` remains easy to
  inspect and back up.
- Keep the application usable without Gemini; local OCR remains the default.
- Keep frontend modules dependency-free and use explicit imports between them.
- Keep `server.py` as the stable entry point used by the Windows launcher.
