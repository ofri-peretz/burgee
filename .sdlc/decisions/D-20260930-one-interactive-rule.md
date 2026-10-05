---
id: D-20260930-one-interactive-rule
subject: 'One interactive rule for the family: burgee''s `ctx.interactive` (stdout TTY, ignores `CI`) or roundel''s `interactive()` (stdin TTY, never under `CI`, never under a detected agent), and which agent variables N12 means. Answered: same rule, 5 vars, burgee lazy'
taken: Accepted
date: '2026-09-30'
superseded_by: —
---

## The owner's answer (2026-09-30): same rule, five variables, burgee lazy

This is the decision as taken. The proposal below it is kept as it was written, and where the two
differ, this section wins.

1. **Same rule.** Wherever burgee decides whether to ask a question, it asks roundel's
   `interactive()`: a terminal on stdin, no `CI`, no detected agent, and `FORCE_TTY=1` over all
   three. In burgee that decision is `ctx.interactive`, which handlers read to choose between
   prompting and `ctx.actionRequired`. Its documented meaning was already "a person may be
   prompted", so the name and type stay and only the rule behind it changes.
2. **Five variables.** `AI_AGENT`, `CLAUDECODE`, `CURSOR_AGENT`, `CODEX_THREAD_ID` and
   `GEMINI_CLI`, and no more. A variable joins only if it **uniquely** identifies an agent: the
   agent sets it, and no terminal a person types in does. `CURSOR_TRACE_ID` fails that test,
   because Cursor sets it in every integrated terminal, and must never be added. None of the other
   eleven candidates listed below has been shown to pass, so none was added. Owner call 1 (the
   `roundel/terminal` budget) is therefore moot, and call 3 is answered no.
3. **burgee lazy.** burgee loads `roundel/terminal` only on the path where a handler is about to
   run, never on help, `--version`, `--schema`, `--mcp` or a failure. The root entry still denies
   `roundel` by name and does not grow. That answers owner call 2 without moving the ceiling.

Spec N12's "13 vendor variables" is corrected to the five, with the rule for adding one. The 13 was
the number of *agents* `@vercel/detect-agent` covers, not a list N12 ever gave.

### Implementation

- `packages/burgee/src/ctx.ts` (new, lazy): `ctxOf(io)` returns the half of a handler's context
  that reads the run rather than argv: `env`, `onExit`, `detectAgent`'s `agent`, and
  `interactive()` from `roundel/terminal` over the run's stdin. `execute.ts` spreads
  `(await import('./ctx.js')).ctxOf(io)` into the context in `dispatch`, just before `node.run`,
  and no longer imports `detectAgent`. `env` and `onExit` moved with it so the startup path pays
  for the call and nothing else.
- **Output stays on the output policy.** Help's colour still passes `detectAgent(env,
  stdoutTTY).interactive` to `colorFor`, which is roundel's `colorLevel` over stdout. It now reads
  `io.out.isTTY` itself in `surfaces.ts`, the only place that asks, instead of a `tty` field the
  engine computed on every run. `Detection.interactive` keeps its value and is now documented as
  the output-side answer. The public `detectAgent`, `AGENT_PROBES` and `RunContext` types are
  unchanged.
- `runBurgee` forwards `tty` onto stdin as well as stdout, so `tty: true` is still a terminal a
  person can answer on. Without `tty`, a stream the caller passed keeps its own `isTTY`.
- **Behaviour change (burgee minor).** A run under a non-empty `CI` is no longer interactive, even
  on a pseudo-terminal. A run whose stdin is piped is no longer interactive, even when stdout is a
  terminal. A run whose stdout is piped and whose stdin is a terminal (`tool deploy | tee log`) now
  is interactive, because an answer can still be typed.

### Bytes, measured

On disk, `dist/`, as `weight.test.ts` walks it (static imports only):

| Entry or chunk | Before | After | Delta |
| :-- | --: | --: | --: |
| `.` (root) | 35,629 | 35,437 | −192 |
| `./cli` | 55,812 | 54,727 | −1,085 |
| `./testing` | 39,150 | 38,143 | −1,007 |
| `ctx.js` (lazy, new) | — | 330 | +330 |
| `surfaces.js` (lazy) | 5,880 | 5,895 | +15 |
| `roundel/terminal` (lazy, roundel's own file) | 878 | 878 | 0 |

Bundled, `esbuild --bundle --minify --splitting` over `import { run } from 'burgee'`, as
`benchmarks/axes/weight.ts` measures it:

| | Before | After | Delta |
| :-- | --: | --: | --: |
| Initial load (entry and its static chunks) | 24,297 | 24,278 | −19 |
| Every chunk together | 78,173 | 78,571 | +398 |

`burgee/commander` (60,913) and `burgee/yargs` (108,302) are unchanged to the byte. The startup
path got smaller, and everything added is behind a dynamic import. The +398 bundled is the `ctx`
chunk (373 B, which includes roundel's `interactive` and `AGENTS`) plus 11 B in `surfaces`. On
disk, burgee's own bytes grow by 153 (330 + 15 − 192). `./cli` and `./testing` fall because
neither takes the barrel, so `agent.js` (893 B) left their static graph. `weight.test.ts` denies
`ctx.js` to `.` by name, next to `roundel`.

### Evidence

- `agent.test.ts`, *one rule for whether a person may be asked (N12)*: an agent on a terminal is
  not asked, for each of the five; CI on a terminal is not asked; a person at a terminal is asked;
  `FORCE_TTY=1` asks under CI and an agent; burgee agrees with `roundel/terminal` case for case; a
  person in Cursor (`CURSOR_TRACE_ID`) is asked; `AGENT_PROBES` equals roundel's `AGENTS`.
- `roundel/src/terminal.test.ts`: *asks a person in Cursor*.
- Coverage stays 100% for burgee and roundel. Compat grades are unchanged: commander 1360 / 1360,
  yargs 804 / 804, meow 146 / 148.

## The proposal, as written before the answer

**Roundel's `interactive()` is the family's one rule for "may a person be asked?".** The owner decided this on 2026-09-30. The rule is: a terminal on stdin, no `CI`, no detected agent, and `FORCE_TTY=1` overrides all three. Wherever burgee decides whether to ask a question, it asks this rule. Decisions about *output*, such as help colour and animation, stay on the output policy (`outputMode`, `colorLevel`). Agent detection covers every variable `@vercel/detect-agent` probes, which is what spec N12 cites. The five probed today are `AI_AGENT`, `CLAUDECODE`, `CURSOR_AGENT`, `CODEX_THREAD_ID` and `GEMINI_CLI`. The twelve to add are `CURSOR_TRACE_ID`, `CURSOR_EXTENSION_HOST_ROLE`, `CODEX_SANDBOX`, `CODEX_CI`, `ANTIGRAVITY_AGENT`, `AUGMENT_AGENT`, `OPENCODE_CLIENT`, `CLAUDE_CODE`, `REPL_ID`, `COPILOT_MODEL`, `COPILOT_ALLOW_ALL` and `COPILOT_GITHUB_TOKEN`. N12's "13" counts *agents*, not variables. Devin is detected by a file (`/opt/.devin`), which a runtime-only function cannot read, so it is left out.

**The implementation waits on three owner calls, because each is a ceiling moving in the loosening direction.** These figures were measured on main at `ad431bbc96`.

1. **`roundel/terminal`'s budget.** The full list takes `terminal.js` from 878 B to 1,101 B, against a 1,000 B budget (`packages/roundel/src/weight.test.ts`).
2. **burgee's root entry.** `ctx.interactive` is computed on every run in `execute.ts`, on the `.` entry. Asking roundel means `import 'burgee'` statically reaches `roundel/terminal`. The `.` rule denies `roundel` by name (cli-output-stack U13), and the entry has 104 B left under 35,681. Keeping burgee's own copy of the list is no cheaper: `agent.js` goes from 893 B to 1,579 B. A copy of the `CI` read is also exactly what `inline-implementation-lock` gives to roundel alone.
3. **`CURSOR_TRACE_ID`.** Cursor sets it in *every* integrated terminal, so a person typing in Cursor would never be prompted. `@vercel/detect-agent` accepts that trade. The family would then refuse prompts to human Cursor users with a `USAGE` verdict that names the flag. That is a behaviour change for people, not only for agents, and needs the owner's explicit yes.

Until the owner answers, nothing changes in code. caique already asks `interactive()` (D-181). burgee's `ctx.interactive` stays `detectAgent`'s answer, and help colour stays on `colorFor`.
