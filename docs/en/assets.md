# Project assets

- `assets/images/`: illustrations and other shared raster images (paths relative to the project root).
- `assets/images/partly-components-banner.png`: generated Partly illustration, available for banners and documentation; not loaded by the application.

Use descriptive lowercase filenames with hyphens. Keep new variants under distinct filenames rather than replacing an existing asset implicitly. Reference local assets with relative URLs such as `assets/images/example.png`; component images can use these paths too.

`partly.ico` stays at the project root because the Windows `Partly.lnk` shortcut references that exact path, as does the page favicon. Moving it requires updating installed shortcuts as well.

The banner was generated with the built-in imagegen tool. Prompt: refined realistic 3D still life of a dual-fan graphics card, motherboard with CPU socket, two RAM sticks, and compact finned CPU cooler; wide elevated three-quarter composition; soft studio lighting; off-white, forest green and lime palette; no text or logos.
