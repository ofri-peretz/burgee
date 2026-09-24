---
'paratext': minor
'burgee': patch
---

`paratext/terminal-link` now links exactly where `supports-hyperlinks` 4.5.0 does. It honours `FORCE_HYPERLINK`, `--no-hyperlink` / `--hyperlink=always`, `CI`, win32 outside Windows Terminal, NETLIFY, and the incumbent's version floors for iTerm2, WezTerm, VS Code and VTE (0.50.0 segfaults on OSC 8). It also recognises kitty, alacritty, ghostty, zed, Orca and Cursor. Its previous guess disagreed with the incumbent in 30 of 55 environments. The compatibility row is now 8 / 8, so `burgee migrate` rewrites `terminal-link` imports to `paratext/terminal-link`.
