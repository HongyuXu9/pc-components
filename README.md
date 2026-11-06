# Partly

**English** · [Italiano](README.it.md) · [简体中文](README.zh-CN.md)

Partly is a local PC component and price tracker. It stores its data in the
readable `data.json` file beside the app; it does not keep data in browser
storage or use a database. If the previous version left data in this browser,
Partly copies it into `data.json` once and clears that old copy after the file
save succeeds.

## Start the app

1. On Windows, double-click `Partly.lnk` to open Partly in its own Chrome or Edge app window. The local server runs without a console window and stops when you close the Partly window.
2. Copy `Partly.lnk` to your Desktop if you want a desktop icon.
3. Close the Partly window to stop the local server.

You can also start the server and app with `run_app.bat`.

Python 3 is required. The server listens only on this PC. Back up `data.json` to keep a copy of your components and price history.

## Project structure

The frontend uses native JavaScript modules, so no Node.js build step is needed. `app.js` coordinates the interface; focused modules under `js/` handle product rules, image recognition, price history, activity logging, and saved-list rendering. `style.css` is the stylesheet entry point and imports the grouped files in `styles/`.

The Python entry point remains `server.py`. Its HTTP routes, configuration, logging, and shared runtime state live in the `partly_server/` package. See [docs/architecture.md](docs/architecture.md) for module boundaries and API responsibilities ([Italiano](docs/architecture.it.md), [简体中文](docs/architecture.zh-CN.md)).

For a walkthrough of the Python settings, `.env`, and the Windows launcher chain (`.lnk` / `.bat` → `.vbs` → PowerShell → Python), see [docs/python-and-windows-launcher.md](docs/python-and-windows-launcher.md) ([Italiano](docs/python-and-windows-launcher.it.md), [简体中文](docs/python-and-windows-launcher.zh-CN.md)).

Product images can be set with an image URL when adding or editing a component. The example parts already include a few product images; those images are hosted by their respective product sites.

The component panel keeps the current build, a separate **Da valutare** list, and a **Cestino**. Items in Da valutare do not affect the build total; add one to the build or replace a current part. Replaced and deleted parts go to the trash, where they can be restored or permanently deleted.

To add several items from a screenshot, open **Add component**, paste the screenshot with **Ctrl+V** (or choose an image), review the detected list, and add all rows together. OCR suggestions can be edited before saving.

Screenshot recognition runs locally with Tesseract by default. For optional AI image recognition, create a Gemini API key in [Google AI Studio](https://aistudio.google.com/app/apikey), save it in a `.env` file beside `server.py` as `GEMINI_API_KEY=your_key`, then restart Partly and enable **AI assist** before pasting an image. AI assist sends the selected screenshot to Google; leave it off to keep recognition local. Google’s free API tier has usage limits and may use submitted content to improve its products, so review Google’s current terms before enabling it.

If saving fails, check partly.log beside data.json. The Save component dialog stays open when the server rejects a save. Browser errors and save activity also appear in the in-app Activity log.
