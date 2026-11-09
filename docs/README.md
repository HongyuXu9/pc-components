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

Search selects the lowest available EUR price per store among returned listings, including prices in Tavily snippets. Snippet prices need manual checking and may include stale or conditional amounts. Stores already saved are skipped entirely; existing prices and links are never changed. If no price is found, one link per missing store can still be added without a price.

UI: offers are labeled From search or Manual. Missing prices display `undefined`. The results window has a Close button at the bottom. Verification labels are not displayed.

Search first filters titles by exact model, then uses configured Gemini to select relevant Tavily candidates without Google Search. Links and prices remain source-bound. Gemini failures fall back to local filtering. Amazon snippets can omit prices; missing prices stay undefined.
