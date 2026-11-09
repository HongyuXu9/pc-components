# Python Server and Windows Launcher

**English** · [Italiano](../it/python-and-windows-launcher.md) · [简体中文](../zh-CN/python-and-windows-launcher.md)

This guide follows the complete path from the Partly icon to the local server,
and explains the settings to study or change when maintaining the app.

## Startup: from the icon to the server

Both `Partly.lnk` and `scripts/run_app.bat` start the same chain. The `.lnk` shortcut
points directly to `wscript.exe` with `scripts/run_app.vbs` as its argument.

```text
Partly.lnk ─┐
            ├─> scripts/run_app.vbs ─> hidden PowerShell ─> scripts/run_app.ps1 ─> python backend/server.py
scripts/run_app.bat ┘
```

1. **`scripts/run_app.bat`** starts Windows Script Host (`wscript.exe`) and passes it
   the path to `scripts/run_app.vbs`. It uses `%~dp0`, so it still works if the project
   folder is moved. The batch file exits immediately; it does not serve pages.
2. **`scripts/run_app.vbs`** builds a Windows PowerShell command with `-NoProfile`,
   `-WindowStyle Hidden`, and `-ExecutionPolicy Bypass`, then starts it without
   a visible window. `-NoProfile` prevents personal PowerShell settings from
   interfering. `-ExecutionPolicy Bypass` applies to this process only and does
   not permanently change Windows policy.
3. **`scripts/run_app.ps1`** finds the app folder from the script location, checks the
   port, locates Python, starts `backend/server.py` hidden, waits for it to respond, and
   opens Partly in a Chrome or Edge app window.
4. The launcher stays alive while the Partly page is active. When the window
   closes, the browser sends `/api/close` and the launcher stops the Python
   process it started. A periodic heartbeat is the fallback if the browser
   closes without sending that signal.

In Task Manager, the process serving the app is therefore `python.exe`;
`scripts/run_app.bat` and `wscript.exe` are not the server. PowerShell stays hidden to
coordinate startup and shutdown.

If Chrome and Edge are not found in the locations checked by the launcher,
`scripts/run_app.ps1` opens the URL with the Windows default browser.

## Python configuration

Settings live in `backend/partly_server/config.py`:

| Constant | What it controls |
| --- | --- |
| `FRONTEND_ROOT` | `ROOT / "frontend"` |
| `ROOT` | Project root, calculated from the location of the Python package |
| `DATA_FILE` | Path to `data/data.json`, which stores Build, Da valutare, and Cestino |
| `LOG_FILE` | Path to `logs/partly.log` |
| `ENV_FILE` | Path to the local `.env` file used for the Gemini key |
| `HOST` | Network interface for the server; `127.0.0.1` limits it to this PC |
| `PORT` | Local HTTP port, currently `8766` |
| `APP_VERSION` | Version returned by `/api/version` |
| `GEMINI_MODEL` | Model used for AI image recognition |
| `HEARTBEAT_TIMEOUT_SECONDS` | How long without a heartbeat before the launcher considers the app inactive |

If you change `PORT`, update `$appUrl` in `scripts/run_app.ps1` as well. The frontend
uses relative API paths, so it has no port number to update. The server binds to
the local loopback address and is not configured to serve other devices on the
network.

## Server files

- **`backend/server.py`** is the stable launcher entry point. It creates `data/data.json` if
  needed, creates the HTTP server, logs startup details, and runs
  `serve_forever()`.
- **`backend/partly_server/config.py`** contains paths and settings.
- **`backend/partly_server/handler.py`** implements HTTP endpoints and serves static app
  files.
- **`backend/partly_server/runtime_state.py`** holds locks for data access, the last
  heartbeat, and the close request. Locks keep concurrent requests from reading
  or writing shared state at the same time.
- **`backend/partly_server/logging_config.py`** configures the `partly` logger to write
  to both a file and the console stream.

The server uses only modules included with Python; no `pip install` is needed.

## Main endpoints

| Method and path | Purpose |
| --- | --- |
| `GET /api/status` | Returns the server host, port, and PID |
| `GET /api/version` | Returns the configured app version |
| `GET /api/data` | Reads the saved JSON file |
| `PUT /api/data` | Atomically saves the three collections |
| `POST /api/log` | Appends browser activity and errors to the log |
| `POST /api/heartbeat` and `GET /api/heartbeat` | Updates and checks whether the Partly page is active |
| `POST /api/close` and `GET /api/close` | Signals an intentional app-window close to the launcher |
| `POST /api/extract-image` | Sends a screenshot to Gemini when AI assist is enabled |

To save data, the server serializes JSON to a temporary file in the same folder,
then renames it over `data/data.json`. This atomic replacement reduces the chance of
leaving a partial file if the process stops during a write. `data_lock`
serializes concurrent access inside the local server process.

## Logs and the Gemini key

`backend/partly_server/logging_config.py` uses `RotatingFileHandler`: `logs/partly.log` rolls
over at 1 MB and keeps up to three previous files. The log includes HTTP
requests and events sent by the browser Activity log. If the server is not
ready, the launcher queues its messages; on startup failure it writes them to
`logs/partly.log`, or to `logs/partly-launcher.log` if the first file is locked.

To enable Gemini, create `.env` in the project root in the project root, with one
line containing your own key:

```dotenv
GEMINI_API_KEY=paste_your_key_here
```

`.env` is excluded from Git. The server checks the `GEMINI_API_KEY` environment
variable first, then reads the same setting from `.env` if the environment
variable is absent. Do not put the key in `config.py`, documentation, or a Git
commit. Restart Partly after changing it. With AI assist off, recognition keeps
using local OCR.

## Manual startup for learning or diagnosis

Open PowerShell in the project folder and run:

```powershell
py -3 backend/server.py
```

If the `py` launcher is unavailable but `python` is installed, run
`python backend/server.py`. The server stays visible in that terminal; press `Ctrl+C` to
stop it. Open `http://127.0.0.1:8766` in a browser to view the app.

When the server is started manually, `scripts/run_app.ps1` is not supervising it, so
closing the browser page does not stop Python automatically. For normal use,
start `Partly.lnk` or `scripts/run_app.bat` so the launcher can manage the browser, logs,
and shutdown together.

Before starting, the launcher checks port `8766`. If it finds a listening
process, it terminates that process and starts a fresh instance. Avoid using
that port for another service when launching Partly.

Static files are served from `FRONTEND_ROOT` (`frontend/`), independently of the working directory. Browser URLs remain `/js/`, `/styles/` and `/assets/`.

## Offer search with Tavily

Click **Find offers · beta** on a Build component to search Amazon.it, eBay.it
and AliExpress.com. Add `TAVILY_API_KEY=your_key` to the local `.env`, then restart
Partly. Each click sends one basic search request; the API reports credit usage
in the log. Gemini is used only for optional screenshot recognition.

The search adds new product links, including results that need manual checking.
It never changes an existing offer's price, link or history. The same product
link is not added twice; only one offer per store is added.
A verified result has a matching model and page metadata confirming a new,
in-stock product with a EUR price. Other results are marked for manual checking.
When no reliable price is available, the saved offer has no price and an empty
history. It is excluded from the Build's lowest-price calculation. Open the link
and use **Log price** to enter the amount yourself.

Search results may contain different variants or unrelated products: check the
model, condition, stock and final price yourself. Shipping is excluded. Search
cannot guarantee the lowest price across the whole web.

## Debug

The shortcut starts a hidden server. Close Partly, open the project in VS Code and press F5 with **Partly: debug server**. Set breakpoints in the editor, then open http://127.0.0.1:8766. The launcher uses `.venv` when present, otherwise system Python. No extra Python packages are required.

```powershell
python -m unittest discover -s tests -v
node --test tests/offer-search.test.mjs
```

Search selects the lowest available EUR price per store among returned listings, including prices in Tavily snippets. Snippet prices need manual checking and may include stale or conditional amounts. Stores already saved are skipped entirely; existing prices and links are never changed. If no price is found, one link per missing store can still be added without a price.

UI: offers are labeled From search or Manual. Missing prices display `undefined`. The results window has a Close button at the bottom. Verification labels are not displayed.
