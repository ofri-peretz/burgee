---
id: D-20260930-one-interactive-rule
subject: 'One interactive rule for the family: burgee''s `ctx.interactive` (stdout TTY, ignores `CI`) or roundel''s `interactive()` (stdin TTY, never under `CI`, never under a detected agent), and which agent variables N12 means'
taken: Accepted
date: '2026-09-30'
superseded_by: —
---

**Roundel's `interactive()` is the family's one rule for "may a person be asked?".** The owner decided this on 2026-09-30. The rule is: a terminal on stdin, no `CI`, no detected agent, and `FORCE_TTY=1` overrides all three. Wherever burgee decides whether to ask a question, it asks this rule. Decisions about *output*, such as help colour and animation, stay on the output policy (`outputMode`, `colorLevel`). Agent detection covers every variable `@vercel/detect-agent` probes, which is what spec N12 cites. The five probed today are `AI_AGENT`, `CLAUDECODE`, `CURSOR_AGENT`, `CODEX_THREAD_ID` and `GEMINI_CLI`. The twelve to add are `CURSOR_TRACE_ID`, `CURSOR_EXTENSION_HOST_ROLE`, `CODEX_SANDBOX`, `CODEX_CI`, `ANTIGRAVITY_AGENT`, `AUGMENT_AGENT`, `OPENCODE_CLIENT`, `CLAUDE_CODE`, `REPL_ID`, `COPILOT_MODEL`, `COPILOT_ALLOW_ALL` and `COPILOT_GITHUB_TOKEN`. N12's "13" counts *agents*, not variables. Devin is detected by a file (`/opt/.devin`), which a runtime-only function cannot read, so it is left out.

**The implementation waits on three owner calls, because each is a ceiling moving in the loosening direction.** These figures were measured on main at `ad431bbc96`.

1. **`roundel/terminal`'s budget.** The full list takes `terminal.js` from 878 B to 1,101 B, against a 1,000 B budget (`packages/roundel/src/weight.test.ts`).
2. **burgee's root entry.** `ctx.interactive` is computed on every run in `execute.ts`, on the `.` entry. Asking roundel means `import 'burgee'` statically reaches `roundel/terminal`. The `.` rule denies `roundel` by name (cli-output-stack U13), and the entry has 104 B left under 35,681. Keeping burgee's own copy of the list is no cheaper: `agent.js` goes from 893 B to 1,579 B. A copy of the `CI` read is also exactly what `inline-implementation-lock` gives to roundel alone.
3. **`CURSOR_TRACE_ID`.** Cursor sets it in *every* integrated terminal, so a person typing in Cursor would never be prompted. `@vercel/detect-agent` accepts that trade. The family would then refuse prompts to human Cursor users with a `USAGE` verdict that names the flag. That is a behaviour change for people, not only for agents, and needs the owner's explicit yes.

Until the owner answers, nothing changes in code. caique already asks `interactive()` (D-181). burgee's `ctx.interactive` stays `detectAgent`'s answer, and help colour stays on `colorFor`.
