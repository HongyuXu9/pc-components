# Documentation

Project documentation is grouped by language. The [main README](../README.md)
is the English entry point for the application.

| Guide | English | Italiano | 简体中文 |
| --- | --- | --- | --- |
| Getting started | [README](../README.md) | [README](it/README.md) | [README](zh-CN/README.md) |
| Architecture | [Guide](en/architecture.md) | [Guida](it/architecture.md) | [指南](zh-CN/architecture.md) |
| Python and Windows launcher | [Guide](en/python-and-windows-launcher.md) | [Guida](it/python-and-windows-launcher.md) | [指南](zh-CN/python-and-windows-launcher.md) |
| Asset conventions | [Guide](en/assets.md) | — | — |

## Repository layout

| Location | Purpose |
| --- | --- |
| `docs/en/`, `docs/it/`, `docs/zh-CN/` | Documentation grouped by language |
| `frontend/js/` | Frontend JavaScript modules |
| `frontend/styles/` | Stylesheets grouped by responsibility |
| `backend/partly_server/` | Python server package |
| `frontend/assets/images/` | Shared image assets |
| `frontend/index.html` | Frontend document served at `/` |
| `backend/server.py` | Python entry point |
| `scripts/` | Windows launchers |
| `data/`, `logs/`, `tests/` | Saved data, runtime logs and tests |
| Project root | Main README and configuration files |

Filesystem paths are absolute and derived from the Python package or launcher location.
Only `frontend/` is served as static files; browser URLs remain `/js/`, `/styles/` and `/assets/`. Local
configuration (`.env`), saved data (`data/data.json`), logs and Python caches are
runtime files; they remain excluded from Git.

## Documentation conventions

- Put guides under their language directory, using the same filename across languages.
- Add new guides to this index and link their translations when available.
- Use relative links so navigation works in a checkout and on GitHub.
- Keep images in `frontend/assets/images/` and documentation in `docs/`.

## Keeping guides current

Read [AGENTS.md](../AGENTS.md) before changing the project. Update the English, Italian and Chinese guides together when behavior changes. Local learning notes in `docs/personale/` are excluded from Git and are not the main product documentation.

Search can return multiple listings per store, deduplicated by product identifier and condition; saving compares their prices against the search tag for that store. Manual offers stay unchanged; search tags accept only lower or first prices per store. Verified prices rank before snippet prices; missing prices remain null and do not affect the minimum. New, used and refurbished listings stay distinct. At most maxCandidates (default 20) are evaluated and maxOffers (default 8) returned. Up to six distinct product pages are checked. Snippet prices require manual verification. The results window shows verification and condition. Tavily sources use uri/title; the obsolete suggestions HTML field is removed. Store rules and limits are shared in frontend/assets/search-stores.json. No additional dependencies or startup settings are required.

Search first filters titles and snippets for plausible brand/model matches, then uses configured Gemini to select relevant Tavily candidates without Google Search. Links and prices remain source-bound. Gemini failures fall back to local filtering. Amazon snippets can omit prices; missing prices stay undefined.

The chart carries the last recorded price through today. Days without records retain the previous price; changes use steps. Dots represent actual editable records only. No synthetic history is saved.

Find offers is available in Build and Watchlist, including incomplete model names. Results save into the originating collection. Watchlist charts also carry prices through today.

Search first uses the exact model in quotes. With fewer than five valid listings (or the configured offer/candidate limit), it tries an unquoted query with a component hint, then a used/refurbished query. There are at most three basic Tavily requests per click, each with its own credit usage. Capacity, speed and model suffixes stay in all queries. Generic titles can use snippet model evidence; a title naming a wrong variant is rejected. A failed fallback keeps earlier results. No new settings or dependencies are needed.

Gemini checks all candidate models and prices in one batch request. Plausible brand/model matches reach Gemini even when titles are incomplete. Page verification and the fallback without Gemini keep strict model checks. Price parsing checks labels attached to the selected amount: mentions of discounts or free shipping elsewhere do not invalidate a selling price. It distinguishes the current full product price from discounts, coupons, installments, shipping and old prices. The backend accepts only a single source-bound EUR quote and always prefers a page-verified price. Ambiguous or missing Gemini prices stay null; without Gemini or on failure, only page verification can supply a price. Snippet prices keep verified=false and the results window labels them as needing verification. Manual saved offers are unchanged. API keys and startup settings are unchanged.

Use **Find all offers** above the component list to search every component in the active Build or Watchlist, including those hidden by filters. The queue shows completed/total components and an error count. **Stop remaining searches** lets the current request finish and save, then skips the rest. The UI stays usable. Searches run sequentially through the existing Tavily + Gemini endpoint and save callback. Duplicate component IDs are skipped; identical names/categories share one result within the run. Changed or removed components are skipped, and one product error does not stop the queue. Individual search stays available when the queue is idle; overlapping searches are ignored. Manual offers remain unchanged; search tags update only for lower or first prices. No new dependencies, backend endpoints, API keys or startup settings are required.

Individual and bulk search share the same save rules. Equal, higher or unknown prices never replace an existing price. Manual tags are excluded from updates. Explicit unavailable/sold-out snippets, matching product-page availability, and HTTP 404/410 remove the listing even when a snippet contains a price. Gemini also rejects unavailable listings in its existing batch call. Unknown availability is not presented as confirmed stock. Store rules, API call limits, configuration and startup are unchanged.

Each offer in Build and Watchlist has an **Edit** button next to **Log price**. It edits store, product link, condition and current price, including unknown prices. Saving a correction marks the offer Manual and removes page-verification metadata, so searches cannot overwrite it. A price correction updates the latest matching current price point; clearing the price removes that point. Earlier history stays saved. Use the chart or Log price to edit other history points. Cancel leaves data unchanged; unsafe links and stale edits are rejected. This uses the existing dialog and /api/data save path; no new dependencies, API keys or startup settings are required.
