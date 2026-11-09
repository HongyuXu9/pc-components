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
Partly. Each click sends up to three basic search requests; the API reports credit usage
in the log. Gemini supports screenshot recognition and optional offer refinement.

The search adds new product links, including results that need manual checking.
It preserves manual offers. Search offers are grouped by store/domain; only lower prices or missing prices are saved, with their product link and condition. Price history is retained.
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

Search can return multiple listings per store, deduplicated by product identifier and condition; saving compares their prices against the search tag for that store. Manual offers stay unchanged; search tags accept only lower or first prices per store. Verified prices rank before snippet prices; missing prices remain null and do not affect the minimum. New, used and refurbished listings stay distinct. At most maxCandidates (default 20) are evaluated and maxOffers (default 8) returned. Up to six distinct product pages are checked. Snippet prices require manual verification. The results window shows verification and condition. Tavily sources use uri/title; the obsolete suggestions HTML field is removed. Store rules and limits are shared in frontend/assets/search-stores.json. No additional dependencies or startup settings are required.

Search first filters titles and snippets for plausible brand/model matches, then uses configured Gemini to select relevant Tavily candidates without Google Search. Links and prices remain source-bound. Gemini failures fall back to local filtering. Amazon snippets can omit prices; missing prices stay undefined.

The chart carries the last recorded price through today. Days without records retain the previous price; changes use steps. Dots represent actual editable records only. No synthetic history is saved.

Find offers is available in Build and Watchlist, including incomplete model names. Results save into the originating collection. Watchlist charts also carry prices through today.

Search first uses the exact model in quotes. With fewer than five valid listings (or the configured offer/candidate limit), it tries an unquoted query with a component hint, then a used/refurbished query. There are at most three basic Tavily requests per click, each with its own credit usage. Capacity, speed and model suffixes stay in all queries. Generic titles can use snippet model evidence; a title naming a wrong variant is rejected. A failed fallback keeps earlier results. No new settings or dependencies are needed.

Gemini checks all candidate models and prices in one batch request. Plausible brand/model matches reach Gemini even when titles are incomplete. Page verification and the fallback without Gemini keep strict model checks. Price parsing checks labels attached to the selected amount: mentions of discounts or free shipping elsewhere do not invalidate a selling price. It distinguishes the current full product price from discounts, coupons, installments, shipping and old prices. The backend accepts only a single source-bound EUR quote and always prefers a page-verified price. Ambiguous or missing Gemini prices stay null; without Gemini or on failure, only page verification can supply a price. Snippet prices keep verified=false and the results window labels them as needing verification. Manual saved offers are unchanged. API keys and startup settings are unchanged.

Use **Find all offers** above the component list to search every component in the active Build or Watchlist, including those hidden by filters. The queue shows completed/total components and an error count. **Stop remaining searches** lets the current request finish and save, then skips the rest. The UI stays usable. Searches run sequentially through the existing Tavily + Gemini endpoint and save callback. Duplicate component IDs are skipped; identical names/categories share one result within the run. Changed or removed components are skipped, and one product error does not stop the queue. Individual search stays available when the queue is idle; overlapping searches are ignored. Manual offers remain unchanged; search tags update only for lower or first prices. No new dependencies, backend endpoints, API keys or startup settings are required.

Individual and bulk search share the same save rules. Equal, higher or unknown prices never replace an existing price. Manual tags are excluded from updates. Explicit unavailable/sold-out snippets, matching product-page availability, and HTTP 404/410 remove the listing even when a snippet contains a price. Gemini also rejects unavailable listings in its existing batch call. Unknown availability is not presented as confirmed stock. Store rules, API call limits, configuration and startup are unchanged.

Each offer in Build and Watchlist has an **Edit** button next to **Log price**. It edits store, product link, condition and current price, including unknown prices. Saving a correction marks the offer Manual and removes page-verification metadata, so searches cannot overwrite it. A price correction updates the latest matching current price point; clearing the price removes that point. Earlier history stays saved. Use the chart or Log price to edit other history points. Cancel leaves data unchanged; unsafe links and stale edits are rejected. This uses the existing dialog and /api/data save path; no new dependencies, API keys or startup settings are required.
