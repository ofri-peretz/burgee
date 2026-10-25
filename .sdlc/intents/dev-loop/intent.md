# Intent — `dev-loop`: your agent is connected to your CLI while you write it

**Status:** shipped · **Opened:** `2026-09-06` · **Owner:** `@ofri-peretz` · **Shipped:** 2026-10-25 in [#1252](https://github.com/ofri-peretz/burgee/pull/1252), the last two criteria (4 and the save segment of 5) locked by `packages/burgee/src/dev.test.ts`; tests only, nothing to publish — see [§ Shipped 2026-10-25](#shipped-2026-10-25)

> **Accepted at the Design→Build gate 2026-10-25** by the coordinator under the owner's delegation
> ([`D-20261025-dev-loop-design-accepted`](../../decisions/D-20261025-dev-loop-design-accepted.md)): W4 byte-identity and W6's watcher segment left to build. See
> [`spec.md` § Design gate 2026-10-25](./spec.md#design-gate-2026-10-25).

**State assigned 2026-09-09** from repo evidence, at the owner’s direction. **Evidence:** `dev.ts` + `dev.test.ts`; fresh module graph per reload, MCP on stdio (W1–W6).

**Restated:** 2026-10-18 — see § Restated 2026-10-18

---

## Restated 2026-10-18

**Criteria 1–3 and 5 restated to what `burgee dev` ships and held, except the save-detection segment of 5; criterion 4 has no test — REMAINING: W4 byte-identical-after-removal test, W6 save-to-reload segment untimed.** *2026-10-25: both held, see [§ Shipped 2026-10-25](#shipped-2026-10-25).*

| ID | promised | on main | check | disposition |
| :-- | :-- | :-- | :-- | :-- |
| 1 (W1) | `burgee dev ./cli.ts` serves MCP on stdio; an edit is visible on the next `tools/list` | yes, for a burgee manifest, a commander `Command` or a yargs instance | `packages/burgee/src/dev.test.ts` › "serves the entry over MCP, and after an edit the new command is listed, announced, and called on its new handler"; `packages/burgee/src/dev-load.test.ts` › "a commander Command, invoked with argv from the user", › "a yargs instance, invoked through its own seam" | held |
| 2 (W2) | `tools/list_changed` on reload, asserted by a conformance case | emitted on every reload by the swappable `startMcp()` server | `packages/burgee/src/dev.test.ts` › "reloads on its own when the watched entry changes" (waits for `notifications/tools/list_changed`) | restated: the check is the dev suite, not `examples/conformance` |
| 3 (W3) | the manifest and the rendered help printed on each save | one `report()` per load: a summary line, a `+` / `-` / `~` diff by command path, and the rendered help | `packages/burgee/src/dev.test.ts` › "serves the entry over MCP, and after an edit the new command is listed, announced, and called on its new handler" (asserts `Usage:` and `+ devdemo ping`); `packages/burgee/src/dev-load.test.ts` › "names a removed command with a minus" | restated |
| 4 (W4) | removing `burgee dev` leaves the CLI byte-identical, asserted by a test | non-inclusion is locked; byte-identity is not tested | `packages/burgee/src/weight.test.ts` › "reaches nothing on its denied list" (`dev.js` denied on `.`, `./testing` and the façade entries) | remaining |
| 5 (W6) | save-to-callable under 500 ms on the 30-command demo | reload-to-callable timed under max(500 ms, five imports of the entry) (gap A30); the save-detection segment is not timed | `packages/burgee/src/dev.test.ts` › "reloads thirty commands within the budget"; `packages/burgee/src/dev-watch-filter.test.ts` › "coalesces saves inside the default 50 ms window into one reload" | budget restated and held; save segment remaining |

- **Constraint 4 (state isolation) is model-held as well as test-held.**
  `.sdlc/models/dev-reload.qnt` models `reload()`'s chain and checks `safety = serialised and
  newestServed`; `.github/workflows/models.yml` runs every tracked `.qnt` with
  `quint run --invariant=safety --max-steps=30 --max-samples=20000`, and its `paths:` trigger
  includes `packages/burgee/src/dev.ts`. It is simulation, not proof. The model found a real
  defect (two saves during one reload imported at once and a stale manifest won), pinned by
  `packages/burgee/src/dev.test.ts` › "serialises reloads that pile up during one, and serves the newest".
- **Criterion 2 (restated).** The emission is a property of the server swap, not of a host, and
  `examples/conformance` drives demos through the host drivers, which do not reload. The
  check that holds the behaviour is the dev suite. It runs on a burgee-shaped entry; the
  commander and yargs entries are loaded and served through the same `swap()`
  (`packages/burgee/src/dev-load.test.ts`) but no case waits for their notification.
- **Criterion 3 (restated).** "The manifest" shipped as a diff of it by command path, beside the
  rendered help; the full manifest is what `--schema` prints, so printing it on every save
  would repeat a surface the author can already ask for.
- **Criterion 4 (remaining).** `dev.ts` contains no file-writing call on FETCH_HEAD, so byte-identity
  plausibly holds, but nothing asserts it. A test that runs `dev()` over a temp project and
  asserts the tree is unchanged afterwards would close it, proven red by a deliberate write.
- **Criterion 5 (remaining in part).** The 500 ms budget is restated by gap A30
  (`.sdlc/gaps/A30.md`, closed): 500 ms or five imports of the same entry on the same machine,
  whichever is larger, because the absolute number graded the host (1,035 ms on a Windows
  runner). The case times from `handle.reload()`, so `fs.watch` detection and the 50 ms
  debounce are outside the clock. The 2026-09-09 pass measured the full path at 89.4 ms and
  66.4 ms by hand; no test does.

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
2. `tools/list_changed` is emitted on reload, ~~and a conformance case asserts it~~.
   **Restated 2026-10-18:** asserted by `packages/burgee/src/dev.test.ts` › "reloads on its own when the watched
   entry changes".
3. On each save, ~~the manifest~~ and the rendered help are printed — one save, every surface.
   **Restated 2026-10-18:** a diff of the manifest by command path and the rendered help;
   held by `packages/burgee/src/dev.test.ts` and `packages/burgee/src/dev-load.test.ts` › "names a removed command
   with a minus".
4. Removing every trace of `burgee dev` from a project leaves its CLI byte-identical
   (Z2), asserted by a test. ~~**Remaining 2026-10-18:** non-inclusion is locked by
   `packages/burgee/src/weight.test.ts`; byte-identity has no test.~~ **Held 2026-10-25:**
   `packages/burgee/src/dev.test.ts` › "after a load, an edit, a watched reload and a stop, every
   file and the listing are as they were".
5. Time from saving a file to an agent being able to call the changed command is under
   500ms on the 30-command demo. **Restated 2026-10-18:** under max(500 ms, five imports
   of the entry) (gap A30), held from `reload()` by `packages/burgee/src/dev.test.ts` › "reloads thirty commands
   within the budget"; ~~the save-detection segment is still untimed (remaining)~~. **Held
   2026-10-25** through the real watcher: `packages/burgee/src/dev.test.ts` › "a save is seen,
   reloaded and callable within the budget, timed from the write".

## Shipped 2026-10-25

**All five criteria hold on merged code, and nothing is left to publish: the two new checks are
tests in the package suite, with no change to `burgee dev` itself.** Built under
[`D-20261025-dev-loop-design-accepted`](../../decisions/D-20261025-dev-loop-design-accepted.md).

| criterion | check | proven red by |
| :-- | :-- | :-- |
| 4 (Z2) | `packages/burgee/src/dev.test.ts` › "after a load, an edit, a watched reload and a stop, every file and the listing are as they were" | a scratch `writeFileSync` of `.burgee-dev-<n>` beside the entry on each reload in `dev.ts`: the listing gained the file and the case failed |
| 5, save segment | `packages/burgee/src/dev.test.ts` › "a save is seen, reloaded and callable within the budget, timed from the write" | `DEFAULT_DEBOUNCE_MS` raised from 50 to 1000 in a scratch edit: 1,438 ms against the 500 ms budget |

The byte-identity case runs over a project of four files (a manifest, a config file, an entry
that imports a second module). It edits the entry once, waits for the watcher's
`notifications/tools/list_changed`, calls the new command and stops. The tree afterwards is
the tree before, plus the one edit the test made. The watcher case times from the write to the
changed command's answer. It uses no fixed sleep and runs at the default debounce. It read 74–100 ms
over four local runs on darwin (budget 500 ms), against the 66–89 ms hand measurement of
2026-09-09. Each run prints its reading on stderr (`W6 save-to-callable through the watcher:
…`), which vitest shows with `--silent=false`.

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
