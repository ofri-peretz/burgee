---
'burgee': minor
'roundel': patch
---

`ctx.interactive` is roundel's `interactive()`, the family's one rule for whether a person may be asked: a terminal on **stdin**, no `CI`, and no detected agent, with `FORCE_TTY=1` over all three. caique's prompts already ask it, so a handler and a prompt now agree about the same shell.

It used to read stdout and ignore `CI`. Three things change for a handler that reads it:

- Under a non-empty `CI` it is `false`, even on a pseudo-terminal.
- With stdin piped it is `false`, even when stdout is a terminal.
- With stdout piped and stdin a terminal (`tool deploy | tee log`) it is `true`, because an answer can still be typed.

burgee loads `roundel/terminal` in a chunk of its own (`ctx.js`, 330 B), only on the path that runs a handler. Help, `--version`, `--schema`, `--mcp` and failures never load it. The root entry shrinks (35,629 → 35,437 B on disk), and so does the bundled initial load of `import { run } from 'burgee'` (24,297 → 24,278 B). `ctx.agent`, `detectAgent`, `AGENT_PROBES` and help's colour, which reads stdout, are unchanged. `runBurgee` forwards `tty` onto stdin too, so `tty: true` is still a terminal a person can answer on.

The agent variables stay at five (`AI_AGENT`, `CLAUDECODE`, `CURSOR_AGENT`, `CODEX_THREAD_ID`, `GEMINI_CLI`). One joins only when it uniquely identifies an agent, so `CURSOR_TRACE_ID`, which Cursor sets in every integrated terminal, never will. roundel's `AGENTS` documents that rule, and a test pins that a person in Cursor is asked.
