# Intent — `dev-loop`: your agent is connected to your CLI while you write it

**Status:** review · **Opened:** `2026-09-06` · **Owner:** `@ofri-peretz`

---

## What is wanted

`interlace dev` watches a CLI's source, reloads it on change, and serves it as an MCP
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

- New `interlace dev` in the developer CLI. **Dev-time only**: nothing it does is required
  to build, ship or run a CLI.
- `cli-mcp` gains `tools/list_changed` emission on reload.
- `apps/docs` gains a getting-started page whose first instruction is `interlace dev`.

## Constraints

1. **Z2 holds: this is additive and removable.** A CLI built without ever running
   `interlace dev` is identical to one built with it. No artifact it produces is an input
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

1. `interlace dev ./cli.ts` serves MCP on stdio; editing a command's description is
   visible to a connected client on its next `tools/list` without any client action.
2. `tools/list_changed` is emitted on reload, and a conformance case asserts it.
3. On each save, the manifest and the rendered help are printed — one save, every surface.
4. Removing every trace of `interlace dev` from a project leaves its CLI byte-identical
   (Z2), asserted by a test.
5. Time from saving a file to an agent being able to call the changed command is under
   500ms on the 30-command demo.

## Open questions

None open. Decided at finalisation (2026-09-06): stdio only, matching `cli-mcp`; watch an
entry file rather than a directory convention, because a convention is the first step
toward oclif's shape; and no HMR of handler state — a full module-graph reload is correct
and simple, and a CLI's startup is measured in milliseconds.
