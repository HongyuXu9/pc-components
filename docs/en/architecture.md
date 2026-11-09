# Architecture

**English** · [Italiano](../it/architecture.md) · [简体中文](../zh-CN/architecture.md)

Partly is a local-first desktop-style web app. It uses the browser for the UI,
Python's standard library for the local HTTP API, and `data/data.json` as its
human-readable persistence layer. There is no build step or runtime package
installation requirement.

## Frontend

`frontend/index.html` is the document shell. It loads the CSS manifest in `frontend/styles/style.css`
and the native ES module entry point in `frontend/js/app.js`.

| Module | Responsibility |
| --- | --- |
| `frontend/js/domain.js` | Product normalization, store detection, migration, and OCR text parsing |
| `frontend/js/activity-log.js` | Browser activity reporting, log window behavior, and lifecycle signals |
| `frontend/js/image-recognition.js` | Screenshot preview, Gemini request, and local OCR orchestration |
| `frontend/js/price-chart.js` | Price chart rendering and price-history editing |
| `frontend/js/action-dialog.js` | Shared confirmation and field-editing dialog, cancellation, and event cleanup |
| `frontend/js/saved-collections.js` | Watchlist and trash card rendering |
| `frontend/js/app.js` | Application state, page rendering, form submission, and event coordination |

Styles are grouped by responsibility under `frontend/styles/`. The import order in
`frontend/styles/style.css` is intentional: responsive rules and feature overrides follow the
base rules they refine.

## Local server

`backend/server.py` is the launcher entry point. The `backend/partly_server` package contains
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
- Keep browser state and API responses plain JSON so `data/data.json` remains easy to
  inspect and back up.
- Keep the application usable without Gemini; local OCR remains the default.
- Keep frontend modules dependency-free and use explicit imports between them.
- Keep `backend/server.py` as the stable entry point used by the Windows launcher.

## Offer search with Tavily

Click **Find offers** on a Build component to search Amazon.it, eBay.it
and AliExpress.com. Add `TAVILY_API_KEY=your_key` to the local `.env`, then restart
Partly. Each click sends one basic search request; the API reports credit usage
in the log. Gemini supports screenshot recognition and optional offer refinement.

The search adds new product links, including results that need manual checking.
It never changes an existing offer's price, link or history. The same product
link is not added twice; only one offer per store is added.
A verified result has a matching model and page metadata confirming a new,
in-stock product with a EUR price. Search results display their price when available, otherwise `undefined`.
When no reliable price is available, the saved offer has no price and an empty
history. It is excluded from the Build's lowest-price calculation. Open the link
and use **Log price** to enter the amount yourself.

Search results may contain different variants or unrelated products: check the
model, condition, stock and final price yourself. Shipping is excluded. Search
cannot guarantee the lowest price across the whole web.

`frontend/js/offer-search.js` → `POST /api/search-offers` → `backend/partly_server/offer_search.py` → Tavily Search.

The server checks product pages; the browser appends new offers and saves through `/api/data`. Missing prices use JSON null and an empty history. No Google Search or Live API is used.

Search selects the lowest available EUR price per store among returned listings, including prices in Tavily snippets. Snippet prices need manual checking and may include stale or conditional amounts. Stores with an existing web offer are skipped; existing prices and links are never changed. If no price is found, one link per missing store can still be added without a price.

UI: offers are labeled From search or Manual. Missing prices display `undefined`. The results window has a Close button at the bottom. Verification labels are not displayed.

Search first filters titles by exact model, then uses configured Gemini to select relevant Tavily candidates without Google Search. Links and prices remain source-bound. Gemini failures fall back to local filtering. Amazon snippets can omit prices; missing prices stay undefined.

The chart carries the last recorded price through today. Days without records retain the previous price; changes use steps. Dots represent actual editable records only. No synthetic history is saved.

Find offers is available in Build and Watchlist, including incomplete model names. Results save into the originating collection. Watchlist charts also carry prices through today.

Sources: Amazon, AliExpress, eBay, PcComponentes, BPM Power, Alternate, LDLC, MediaWorld, Unieuro and Subito, including used/refurbished listings. Search evaluates up to 20 candidates and returns at most 8 offers, one per site, sorted by price with missing prices last. Condition comes from titles when identifiable. Direct page checks are capped at 6; other listings use snippets.

Store configuration: `frontend/assets/search-stores.json`, shared by server and browser. Each entry has domain, name and productPattern (product URL expression). maxCandidates and maxOffers are configurable up to 20. Restart Partly and reload after edits. API keys stay in .env. A manual and a web offer can coexist per store, even if the web price is higher. Existing offers are never overwritten.
