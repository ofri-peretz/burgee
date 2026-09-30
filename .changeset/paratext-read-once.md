---
"paratext": patch
"flagstaff": patch
---

Faster, and lighter:

- `link()` from `paratext` reads the process once, on its first call, where it used to rebuild the runtime and re-read the environment on every call.
- `paratext/terminal-link` decides hyperlink support once per stream, as `supports-hyperlinks` does at import, and emits a link as a single concatenation.
- Templates are parsed once, and `eraseLines` keeps the strings for the counts a redraw uses.
- In B5 (ours ÷ incumbent, in-process), `paratext` against ansi-escapes went from 8.9× to 0.97× locally, and `paratext/terminal-link` against terminal-link from 20.9× to 0.78×.
- The root bundle is 1,356 B smaller (8,417 → 7,061), because the plugin-schema fragments paratext and flagstaff import to validate no longer carry the schema's prose. The published `schema.json` is unchanged.
