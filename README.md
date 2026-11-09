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

Search selects the lowest available EUR price per store among returned listings, including prices in Tavily snippets. Snippet prices need manual checking and may include stale or conditional amounts. Stores already saved are skipped entirely; existing prices and links are never changed. If no price is found, one link per missing store can still be added without a price.

UI: offers are labeled From search or Manual. Missing prices display `undefined`. The results window has a Close button at the bottom. Verification labels are not displayed.

Offer origin uses a blue From search badge or a gray Manual badge, with text and a colored dot.

Origin badges appear before the store name, with compact spacing and aligned text.

Search first filters titles by exact model, then uses configured Gemini to select relevant Tavily candidates without Google Search. Links and prices remain source-bound. Gemini failures fall back to local filtering. Amazon snippets can omit prices; missing prices stay undefined.
