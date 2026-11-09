# Partly

**English** Â· [Italiano](docs/it/README.md) Â· [ç®€ä½“ä¸­æ–‡](docs/zh-CN/README.md)

Partly is a local PC component and price tracker. It stores its data in the
readable `data/data.json` file beside the app; it does not keep data in browser
storage or use a database. If the previous version left data in this browser,
Partly copies it into `data/data.json` once and clears that old copy after the file
save succeeds.

## Start the app

1. On Windows, double-click `Partly.lnk` to open Partly in its own Chrome or Edge app window. The local server runs without a console window and stops when you close the Partly window.
2. Copy `Partly.lnk` to your Desktop if you want a desktop icon.
3. Close the Partly window to stop the local server.

You can also start the server and app with `scripts/run_app.bat`.

Python 3 is required. The server listens only on this PC. Back up `data/data.json` to keep a copy of your components and price history.

## Project structure

Start with the [documentation index](docs/README.md) for all guides and translations.
Documentation is grouped under `docs/en/`, `docs/it/`, and `docs/zh-CN/`;
this is the only README kept at the project root. Application entry points
and Windows launcher paths remain at the root.

The frontend uses native JavaScript modules, so no Node.js build step is needed. `frontend/js/app.js` coordinates the interface; focused modules under `frontend/js/` handle product rules, image recognition, price history, activity logging, and saved-list rendering. `frontend/styles/style.css` is the stylesheet entry point and imports the grouped files in `frontend/styles/`.

The Python entry point remains `backend/server.py`. Its HTTP routes, configuration, logging, and shared runtime state live in the `backend/partly_server/` package. See [docs/architecture.md](docs/en/architecture.md) for module boundaries and API responsibilities ([Italiano](docs/it/architecture.md), [ç®€ä½“ä¸­æ–‡](docs/zh-CN/architecture.md)).

For a walkthrough of the Python settings, `.env`, and the Windows launcher chain (`.lnk` / `.bat` â†’ `.vbs` â†’ PowerShell â†’ Python), see [docs/python-and-windows-launcher.md](docs/en/python-and-windows-launcher.md) ([Italiano](docs/it/python-and-windows-launcher.md), [ç®€ä½“ä¸­æ–‡](docs/zh-CN/python-and-windows-launcher.md)).

Product images can be set with an image URL when adding or editing a component. The example parts already include a few product images; those images are hosted by their respective product sites.

The component panel keeps the current build, a separate **Da valutare** list, and a **Cestino**. Items in Da valutare do not affect the build total; add one to the build or replace a current part. Replaced and deleted parts go to the trash, where they can be restored or permanently deleted.

To add several items from a screenshot, open **Add component**, paste the screenshot with **Ctrl+V** (or choose an image), review the detected list, and add all rows together. OCR suggestions can be edited before saving.

Screenshot recognition runs locally with Tesseract by default. For optional AI image recognition, create a Gemini API key in [Google AI Studio](https://aistudio.google.com/app/apikey), save it in a `.env` file in the project root as `GEMINI_API_KEY=your_key`, then restart Partly and enable **AI assist** before pasting an image. AI assist sends the selected screenshot to Google; leave it off to keep recognition local. Googleâ€™s free API tier has usage limits and may use submitted content to improve its products, so review Googleâ€™s current terms before enabling it.

If saving fails, check logs/partly.log in logs/. The Save component dialog stays open when the server rejects a save. Browser errors and save activity also appear in the in-app Activity log.

Shared images live in `frontend/assets/images/`; see [asset conventions](docs/en/assets.md).

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

Search can return multiple listings per store, deduplicated by product identifier and condition; saving compares their prices against the search tag for that store. Manual offers stay unchanged; search tags accept only lower or first prices per store. Verified prices rank before snippet prices; missing prices remain null and do not affect the minimum. New, used and refurbished listings stay distinct. At most maxCandidates (default 20) are evaluated and maxOffers (default 8) returned. Up to six distinct product pages are checked. Snippet prices require manual verification. The results window shows verification and condition. Tavily sources use uri/title; the obsolete suggestions HTML field is removed. Store rules and limits are shared in frontend/assets/search-stores.json. No additional dependencies or startup settings are required.

Offer origin uses a blue From search badge or a gray Manual badge, with text and a colored dot.

Origin badges appear before the store name, with compact spacing and aligned text.

Search first filters titles and snippets for plausible brand/model matches, then uses configured Gemini to select relevant Tavily candidates without Google Search. Links and prices remain source-bound. Gemini failures fall back to local filtering. Amazon snippets can omit prices; missing prices stay undefined.

The chart carries the last recorded price through today. Days without records retain the previous price; changes use steps. Dots represent actual editable records only. No synthetic history is saved.

Find offers is available in Build and Watchlist, including incomplete model names. Results save into the originating collection. Watchlist charts also carry prices through today.

Search first uses the exact model in quotes. With fewer than five valid listings (or the configured offer/candidate limit), it tries an unquoted query with a component hint, then a used/refurbished query. There are at most three basic Tavily requests per click, each with its own credit usage. Capacity, speed and model suffixes stay in all queries. Generic titles can use snippet model evidence; a title naming a wrong variant is rejected. A failed fallback keeps earlier results. No new settings or dependencies are needed.

Gemini checks all candidate models and prices in one batch request. Plausible brand/model matches reach Gemini even when titles are incomplete. Page verification and the fallback without Gemini keep strict model checks. Price parsing checks labels attached to the selected amount: mentions of discounts or free shipping elsewhere do not invalidate a selling price. It distinguishes the current full product price from discounts, coupons, installments, shipping and old prices. The backend accepts only a single source-bound EUR quote and always prefers a page-verified price. Ambiguous or missing Gemini prices stay null; without Gemini or on failure, only page verification can supply a price. Snippet prices keep verified=false and the results window labels them as needing verification. Manual saved offers are unchanged. API keys and startup settings are unchanged.

Use **Find all offers** above the component list to search every component in the active Build or Watchlist, including those hidden by filters. The queue shows completed/total components and an error count. **Stop remaining searches** lets the current request finish and save, then skips the rest. The UI stays usable. Searches run sequentially through the existing Tavily + Gemini endpoint and save callback. Duplicate component IDs are skipped; identical names/categories share one result within the run. Changed or removed components are skipped, and one product error does not stop the queue. Individual search stays available when the queue is idle; overlapping searches are ignored. Manual offers remain unchanged; search tags update only for lower or first prices. No new dependencies, backend endpoints, API keys or startup settings are required.

Individual and bulk search share the same save rules. Equal, higher or unknown prices never replace an existing price. Manual tags are excluded from updates. Explicit unavailable/sold-out snippets, matching product-page availability, and HTTP 404/410 remove the listing even when a snippet contains a price. Gemini also rejects unavailable listings in its existing batch call. Unknown availability is not presented as confirmed stock. Store rules, API call limits, configuration and startup are unchanged.

Each offer in Build and Watchlist has an **Edit** button next to **Log price**. It edits store, product link, condition and current price, including unknown prices. Saving a correction marks the offer Manual and removes page-verification metadata, so searches cannot overwrite it. A price correction updates the latest matching current price point; clearing the price removes that point. Earlier history stays saved. Use the chart or Log price to edit other history points. Cancel leaves data unchanged; unsafe links and stale edits are rejected. This uses the existing dialog and /api/data save path; no new dependencies, API keys or startup settings are required.
