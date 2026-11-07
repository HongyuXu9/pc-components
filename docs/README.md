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
| `js/` | Frontend JavaScript modules |
| `styles/` | Stylesheets grouped by responsibility |
| `partly_server/` | Python server package |
| `assets/images/` | Shared image assets |
| Project root | Main README, frontend entry points, Python entry point, Windows launchers and app icon |

The root paths used by the app and Windows shortcuts are kept stable. Local
configuration (`.env`), saved data (`data.json`), logs and Python caches are
runtime files; they remain excluded from Git.

## Documentation conventions

- Put guides under their language directory, using the same filename across languages.
- Add new guides to this index and link their translations when available.
- Use relative links so navigation works in a checkout and on GitHub.
- Keep images in `assets/images/` and documentation in `docs/`.
