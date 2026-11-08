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

## Experimental offer search

The Build button **Search offers · beta** uses `gemini-3.8-live` with Google
Search, separately from screenshot recognition. Install the optional SDK once:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

The Windows launcher uses `.venv` when present. For a manual start, use
`.\.venv\Scripts\python.exe backend/server.py`. Restart Partly after installation.
The existing `GEMINI_API_KEY` is kept on the server.

Each click opens one Live API session (60-second search deadline), submits a text
query and receives listings through a function call. Audio output is discarded;
no microphone is used. Google grounding sources and product-page verification
remain required before an offer can be saved automatically. Searches currently
cover Amazon.it, eBay.it and AliExpress.com; shipping is excluded.

Google lists Search grounding as supported for these Live models on the free
tier, but actual availability depends on the project's quota. Our November 8,
2026 test reached the v1beta Live service and was rejected with a quota-exceeded
error (WebSocket 1011). Real offer discovery has therefore not yet been confirmed
on this account. There is no automatic paid-provider fallback or retry loop.

References: [Live tools](https://ai.google.dev/gemini-api/docs/live-api/tools),
[pricing and quotas](https://ai.google.dev/gemini-api/docs/pricing).
