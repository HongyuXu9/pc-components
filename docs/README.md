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

Search retains multiple listings per store and deduplicates by product URL identifier and condition. Existing offers stay unchanged. Verified prices rank before snippet prices; missing prices remain null and do not affect the minimum. New, used and refurbished listings stay distinct. At most maxCandidates (default 20) are evaluated and maxOffers (default 8) returned. Up to six distinct product pages are checked. Snippet prices require manual verification. The results window shows verification and condition. Tavily sources use uri/title; the obsolete suggestions HTML field is removed. Store rules and limits are shared in frontend/assets/search-stores.json. No additional dependencies or startup settings are required.

Search first filters titles by exact model, then uses configured Gemini to select relevant Tavily candidates without Google Search. Links and prices remain source-bound. Gemini failures fall back to local filtering. Amazon snippets can omit prices; missing prices stay undefined.

The chart carries the last recorded price through today. Days without records retain the previous price; changes use steps. Dots represent actual editable records only. No synthetic history is saved.

Find offers is available in Build and Watchlist, including incomplete model names. Results save into the originating collection. Watchlist charts also carry prices through today.

Search first uses the exact model in quotes. With fewer than five valid listings (or the configured offer/candidate limit), it tries an unquoted query with a component hint, then a used/refurbished query. There are at most three basic Tavily requests per click, each with its own credit usage. Capacity, speed and model suffixes stay in all queries. Generic titles can use snippet model evidence; a title naming a wrong variant is rejected. A failed fallback keeps earlier results. No new settings or dependencies are needed.
