# Intent — `dev-loop`: your agent is connected to your CLI while you write it

**Status:** review · **Opened:** `2026-09-06` · **Owner:** `@ofri-peretz`

---

## What is wanted

`burgee dev` watches a CLI's source, reloads it on change, and serves it as an MCP
server on stdio at the same time. An agent connected to that server sees a command the
moment it is written — no rebuild, no restart, no reconfiguration.

The same command also prints the manifest and the rendered help on each reload, so the
author sees every surface their declaration produces without running four commands.

## Why now

Two loops are slow today and both are ours to fix.

**Writing a CLI.** The author edits a command, then runs it, then runs `--help` to check
the rendering, then `--schema` to check the shape. Four invocations of a process that
takes 50ms to start, plus the thinking in between. Every surface is derived from one
manifest (`architecture.md` §1), so all of them can be recomputed and shown on one save.

**Writing a CLI *for an agent*.** This is the loop the project exists to improve and it is
currently the worst one: change a command, restart the agent's MCP connection, re-list
tools, try again. MCP has `tools/list_changed` precisely for this, and because `--mcp` is
generated from the manifest (`cli-mcp`), a reload can emit it for free.

Neither needs new machinery. `--mcp` exists, the manifest exists, the `Runtime` seam that
lets a CLI be loaded in-process exists (T1). This intent is the loop around them.

## Affected users and systems

- New `burgee dev` in the developer CLI. **Dev-time only**: nothing it does is required
  to build, ship or run a CLI.
- `cli-mcp` gains `tools/list_changed` emission on reload.
- `apps/docs` gains a getting-started page whose first instruction is `burgee dev`.

## Constraints

1. **Z2 holds: this is additive and removable.** A CLI built without ever running
   `burgee dev` is identical to one built with it. No artifact it produces is an input
   to anything else.
2. **No file-layout convention.** It watches whatever entry file it is pointed at, the way
   `node --watch` does. Requiring `src/commands/**` is how a library becomes a framework
   (Z1).
3. **Zero runtime dependencies** in the shipped framework (K1). The dev command may use
   Node's own `fs.watch` and nothing else; it is a devDependency of the *user's* project
   at most, never a runtime dependency of their CLI.
4. **Reload must not leak state**: each reload gets a fresh module graph and a fresh
   `Runtime`, so a stale handler can never answer a tool call.

## Success criteria

1. `burgee dev ./cli.ts` serves MCP on stdio; editing a command's description is
   visible to a connected client on its next `tools/list` without any client action.
2. `tools/list_changed` is emitted on reload, and a conformance case asserts it.
3. On each save, the manifest and the rendered help are printed — one save, every surface.
4. Removing every trace of `burgee dev` from a project leaves its CLI byte-identical
   (Z2), asserted by a test.
5. Time from saving a file to an agent being able to call the changed command is under
   500ms on the 30-command demo.

## Verified against `main` — 2026-09-09

Checked criterion by criterion on `61bd11b9`. **Two of five met, two half.** The status stays
`review`. `burgee dev` is real, listed in `burgee --help`, and fast — the gap is that two of the
checks this intent names do not exist.

- **`burgee dev ./cli.ts` serves MCP on stdio; an edited description is visible to a connected
  client on its next `tools/list` with no client action** — **met.** `dev.test.ts:93` drives the
  full sequence and additionally proves the stale-handler case, that a call routes to the
  reloaded handler. Caveat worth recording: the test drives `dev()` against a `PassThrough` pair
  in-process rather than a spawned stdio child.
- **`tools/list_changed` emitted on reload, and a conformance case asserts it** — half. The
  emission is real and asserted twice in `dev.test.ts` (lines 118, 139). **There is no
  conformance case**: `examples/conformance/src/mcp.test.ts` has three cases and no
  `list_changed` reference, and the criterion names the conformance suite specifically.
- **On each save, the manifest and the rendered help are printed** — half. `report()`
  (`dev.ts:136-148`) prints, on every reload, a one-line summary, a `+` / `-` / `~` diff by
  command path, and the full `renderHelp(...)`. Help: yes. **Manifest: a count and a diff of it,
  not the manifest.**
- **Removing every trace of `burgee dev` leaves the CLI byte-identical (Z2), asserted by a test**
  — **not met.** No such test exists. What exists is a weight proxy: `weight.test.ts` lists
  `dev.js` in the `denied` array for `'.'`, `'./testing'`, `'./cli'`, `'./commander'` and
  `'./yargs'`, proving the framework never imports it. That is a good guard, but it proves
  non-inclusion, not byte-identity of the user's built CLI.
- **Time from saving a file to an agent being able to call the changed command is under 500 ms on
  the 30-command demo** — **met, and measured end to end for this pass.** The shipped test
  (`dev.test.ts:166`) times only from an explicit `handle.reload()`, skipping `fs.watch`
  detection and the debounce, so it does not measure what the criterion says. Driving the full
  watcher path on a generated 30-command CLI — write the file, wait for
  `notifications/tools/list_changed`, call the changed command, check the new answer — took
  **89.4 ms and 66.4 ms** on two runs, against the explicit-reload path's 26.9 ms. Comfortably
  inside 500 ms either way; the shipped test should be widened to measure the path it claims.

## Open questions

None open. Decided at finalisation (2026-09-06): stdio only, matching `cli-mcp`; watch an
entry file rather than a directory convention, because a convention is the first step
toward oclif's shape; and no HMR of handler state — a full module-graph reload is correct
and simple, and a CLI's startup is measured in milliseconds.
