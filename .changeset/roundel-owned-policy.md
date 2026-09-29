---
"roundel": patch
"caique": patch
"flagstaff": patch
"burgee": patch
"paratext": patch
---

Whether anybody is there, whether to colour, and whether a tick can be drawn are roundel's questions, and three packages answered them by hand.

- `roundel/terminal` (new subpath, 878 B, reaching nothing): `interactive(rt)` — a terminal on stdin, no `CI`, and no agent variable (`CLAUDECODE`, `AI_AGENT`, `CURSOR_AGENT`, `CODEX_THREAD_ID`, `GEMINI_CLI`, exported as `AGENTS`), with `FORCE_TTY=1` as the override — and `unicode(rt)`, is-unicode-supported 2.1.0's table over `{ env, platform }`.
- `caique/decide` now depends on `roundel` and asks `interactive()`. **Behaviour change:** under an agent that has a terminal — `CLAUDECODE=1` and a TTY on stdin — a missing required value is refused with a usage error naming the flag (`--x is required when nobody is there to answer`) instead of prompting and hanging the agent. `FORCE_TTY=1` now prompts even without a terminal on stdin, as it does for burgee.
- `caique/inquirer`'s tick and `flagstaff/ora`'s log symbols and spinner fallback use roundel's `unicode()`. caique's copy was a four-condition subset: the Linux console (`TERM=linux`) now gets `√` rather than `✔`, and ConEmu/Cmder, Terminus, Alacritty, rxvt-unicode and JetBrains' terminal on Windows now get `✔`, as `figures` draws them.
- `burgee` help colour is roundel's `colorLevel(rt) > 0`. **Behaviour changes:** `NO_COLOR` now beats `FORCE_COLOR`; `--no-color` and `--color=…` on the command line are honoured; `CLI_ACCESSIBLE` turns help colour off; and a terminal that sets no `TERM` (Windows' conhost) gets plain help unless `FORCE_COLOR`, `--color` or `COLORTERM` asks for colour.
- `burgee/contrast` rounds with roundel's `round2`; no output changes.
- `paratext`: the supports-color fork behind `paratext/terminal-link` is unchanged, and now held to roundel's policy by a parity test everywhere their two incumbents agree.
