# Partly

Partly is a local PC component and price tracker. It stores its data in the
readable `data.json` file beside the app; it does not keep data in browser
storage or use a database. If the previous version left data in this browser,
Partly copies it into `data.json` once and clears that old copy after the file
save succeeds.

## Start the app

1. On Windows, double-click `Partly.lnk` to open the app in its own Edge window.
2. Copy `Partly.lnk` to your Desktop if you want a desktop icon.
3. Keep the minimized server window open while using Partly. Close it to stop the local server.

You can also start the server and app with `run_app.bat`.

Python 3 is required. The server listens only on this PC. Back up `data.json` to keep a copy of your components and price history.

Product images can be set with an image URL when adding or editing a component. The example parts already include a few product images; those images are hosted by their respective product sites.

To add several items from a screenshot, open **Add component**, paste the screenshot with **Ctrl+V** (or choose an image), review the detected list, and add all rows together. OCR suggestions can be edited before saving.
