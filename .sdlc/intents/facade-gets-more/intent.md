# Intent — the façade user gets the agent surfaces too

**Status:** review · **Opened:** `2026-09-21` · **Owner:** `@ofri-peretz`

---

## What is wanted

A program written in plain commander or plain yargs syntax, whose only change is the
import specifier, gets burgee's agent surfaces without adopting any burgee syntax:

- `--mcp` lists its commands as tools and **answers** `tools/call`;
- `--json` is accepted wherever a flag may be written, and a failure comes back as the
  envelope rather than as prose on stderr.

Compatibility is the floor. This intent is about what is on top of it.

## Why now

A plain commander program on `burgee/commander` — `new Command()`, `.command()`,
`.option()`, `.action()`, `parseAsync` — measured on `8104eb9` (`.claude/repro/`,
reproduced in `facade-surface.test.ts`):

| probe | measured before |
| :-- | :-- |
| `demo --mcp`, `tools/list` | `{"tools":[]}` |
| `demo --mcp`, `tools/call` on a command that **did** declare effects | **no reply at all**; the process exits 0 and a client waits forever |
| `demo --json` (root is a command group) | `error: unknown option '--json'`, exit 1 |
| `demo greet --json Ofri` (flag before the positional) | `error: unknown option 'Ofri'`, exit 1 |
| `demo greet --json` (missing required argument) | `error: missing required argument 'who'` on stderr, exit 1 — no envelope |
| `demo greet Ofri --json` | ✅ `{"ok":true,"data":{…}}` |

So the headline — *your existing commander CLI becomes an MCP server by changing one
import* — is false, and it fails for exactly the audience it targets. The second row is
worse than the first: a tool that **is** listed cannot be called, because the transport
writer is stolen mid-session.

Two of the owner's readings turned out to be narrower than stated, and both are recorded
here rather than quietly fixed:

- `--json` is **not** universally refused. It works today in the position a person
  usually writes it (`demo greet Ofri --json`). It is refused at the root of a command
  group, and it swallows the following operand when written before one.
- `.effects()` **already exists** on both façades (`commander/command.ts`,
  `yargs/factory.ts`) and already produces a tool. The additive-method pattern the brief
  asks for is shipped; what is missing is what happens when nobody uses it.

## Affected users and systems

`packages/burgee/src/mcp.ts`, `packages/burgee/src/commander/command.ts`. The graded
rows `commander 1360 / 1360` and `yargs 804 / 804` must not move. The `./commander`
weight entry is 27 bytes under its ceiling and has to move; `.` must not get heavier.

## Constraints

- commander 1360 / 1360 and yargs 804 / 804, after every change.
- Zero runtime dependencies. Node 24.
- `withheld` keeps meaning **absent from `tools/list`**. That is the security posture N2
  and N6 exist for and this intent does not touch it.
- An undeclared command may not be given a reassuring default. "I do not know" is the
  honest answer and the client decides what to do with it.
- `.` (the root entry) may not get heavier.

## Success criteria

1. `tools/list` on a façade program with no declarations lists every runnable command,
   each annotated `undeclared`, with no MCP effect hints at all.
2. `tools/call` against a façade program returns the same `--json` envelope a CLI caller
   gets, for the first call and for every call after it.
3. A command that declared `effects: 'withheld'` on either façade is still absent.
4. `--json` is accepted at any position a flag may be written on the commander façade,
   consumes nothing, and never becomes `unknown option`.
5. A commander-façade failure under `--json` prints `{"ok":false,…}` on stdout and
   nothing on stderr, and carries `fix` when the suggestion is unambiguous.
6. `npm run compat -- commander` reports 1360 / 1360 and `npm run compat -- yargs`
   reports 804 / 804.

## Open questions

None. The two this raised are closed in `.sdlc/DECISIONS.md` as D-076 and D-077.
