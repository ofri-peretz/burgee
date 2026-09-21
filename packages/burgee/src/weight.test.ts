/**
 * K6/B4 — weight is paid per import, never per config.
 *
 * Selecting commander-, yargs- or native-shaped burgee is an *import specifier*,
 * resolved by the bundler, not a runtime `config.mode`. A runtime flag would ship
 * every front-end to every user and decline to execute two of them — full weight,
 * no benefit (competitor map §6). Separate entry points mean a user who imports
 * `burgee` never has commander or yargs in their bundle, and tree-shaking works
 * because there is nothing to shake: the bytes were never pulled in.
 *
 * This walks the import graph of every entry point in `exports` and asserts what
 * each may reach. The important property is the last test: **an entry point
 * cannot be added without declaring its budget here**, so this lock grows with the
 * package instead of rotting behind it.
 *
 * It reads `dist/`, so it measures what is published rather than what is written.
 */
import { readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const pkgRoot = fileURLToPath(new URL("..", import.meta.url));
const dist = resolve(pkgRoot, "dist");

interface Manifest {
  exports: Record<string, { import: string }>;
}

// Read rather than import: the published entry list is data here, and a JSON
// import would reach out of src/ for it.
const manifest = JSON.parse(
  readFileSync(resolve(pkgRoot, "package.json"), "utf8"),
) as Manifest;

interface EntryRule {
  /** Bare specifiers this entry may import. The host front-ends will name their peer. */
  allow: string[];
  /** Bytes reachable from it. A ratchet: lowering is free, raising is a decision. */
  budget: number;
  /** Modules this entry must never reach, whatever else changes. */
  denied: string[];
}

const RULES: Record<string, EntryRule> = {
  // The engine. Imports nothing at all, and never drags the harness in.
  // Raised from 12,000 on 2026-09-07, deliberately and once: the entry now reaches
  // the execution core and the manifest, which is the whole engine and is what
  // `import 'burgee'` should give you. 12 KB against commander's 232 KB installed.
  // Raised from 20,000 on 2026-09-07, deliberately and once more: help is rendered from
  // the manifest in core (H1 of cli-help-renderer), which is 6 KB of renderer replacing
  // 1.5 KB of placeholder. 32 KB for engine + manifest + help, against commander's
  // lib/help.js alone at 20.8 KB.
  // Raised from 32,000 on 2026-09-08 for the V family (commander-env): precedence, its
  // provenance and --explain run on every invocation, so they are core, not a lazy entry.
  // Core is now engine + manifest + help + schema + mcp + precedence: 35 KB against
  // commander's 126 KB lib/. Config discovery itself stays lazy (burgee loads it only for a
  // program that opted in), as do the completion templates.
  // Raised from 40,000 on 2026-09-08 for the S family (commander-schema): validation —
  // numbers, choices, relations, Standard Schema — runs on every invocation. Core is now
  // engine + manifest + help + schema + mcp + precedence + validate, 42.7 KB against
  // commander's 126 KB lib/. Each floor family has cost about 5 KB; the lock stays to
  // catch the accidental kind of growth, and each of these was a decision in a PR.
  // dev.js is the dev loop: dev-time only and removable (dev-loop W4), so the framework
  // never reaches it; the CLI reaches it through a dynamic import, paid only on `burgee dev`.
  // Raised from 48,000 on 2026-09-08 by the width of one function: startMcp(), the swappable
  // server the dev loop swaps manifests into, which serveMcp() now wraps (+0.4 KB; 48.1 KB
  // measured). The dev loop itself stays out of core — see the denied list.
  // Raised from 50,000 on 2026-09-08 for cli-modularity (M2 lazy nodes, M4 shared options,
  // M5 the deprecation warning, M6 resolveCommand/runCommand) and the required-positional
  // check the M6 test exposed: 50.2 KB measured before the check. Core is now 51 KB
  // against commander's 126 KB lib/.
  // Raised again (same day, same 50,000 ceiling) for the theme seam (help renderer R7, roundel "used
  // without being imported"): `renderHelp({ color, theme })` and its four styleText defaults
  // are 1 KB of core, since help is core. 49.0 KB against commander's 126 KB lib/.
  // The output stack is denied by name (U13 of cli-output-stack): `import 'burgee'` never
  // resolves a family specifier. `allow: []` already forbids every bare import; naming
  // these three records the decision, so a future `allow` entry cannot admit them by accident.
  // 52,000 was main's ceiling after the large-CLI work (#33), with the theme seam measuring
  // 51,921 inside it. Raised to 52,100 on 2026-09-09, and this is the decision that ratchet
  // exists to force rather than a drift: `--version` on a program that is a pure command
  // group answered `unknown command "--version"` and **exit 2**, where real commander and
  // real yargs both print the version and exit 0. Under E1 exit 2 means *rewrite the
  // command*, so an agent asked for a version rewrote it until it gave up — on the flag
  // people type first. The fix costs **114 bytes** (51,921 → 52,035), written as two string
  // comparisons rather than a `Set`, which was 57 bytes more for the same behaviour. The
  // ceiling is the next hundred above the measurement, leaving 65 bytes.
  //
  // The published claim is untouched: "the core entry point is under 52 KB **bundled**" is
  // a different measurement — 34,841 bytes against a 53,248 target — and this budget is
  // bytes on disk of the `dist/` files an import reaches.
  //
  // Raised again to 52,900 on 2026-09-09, for `agent-headroom` R1, and stated the same way.
  // The `--version` fix above left **20 bytes** of headroom — 52,680 measured against 52,700 —
  // so R1 is the first change of any size to arrive after it. R1 costs **213 bytes**
  // (52,680 → 52,893) and takes 16,548 off *every* `--schema` an agent reads: 39,512 → 22,964
  // on the large reference demo, for a byte-identical parse. Paid once per install against a
  // saving per invocation, which is the whole trade.
  //
  // 53,300 on 2026-09-13: `--schema` publishes `relations` (S2/S6). 395 B for the type, the
  // predicate marker and the pass-through. `validate.ts` has enforced these constraints all
  // along and the schema never said so, which left an agent discovering that `--csv`
  // conflicts with `--table` by sending both and reading exit 2 — one round trip per
  // constraint, and E1 reads exit 2 as *rewrite the command*, which invites the same pair
  // again. Measured 53,295.
  //
  // Two seniority subpaths, not the bare package — changed 2026-09-15 when the weight gate
  // caught the engine 37% over its ceiling. The barrel pulled the whole package in, including
  // a dynamic `import('seniority')` no bundler can shake; naming the halves cut 26%.
  //
  // `seniority` is the one bare import `.` admits, and it is admitted rather than denied
  // because the alternative was worse: burgee shipped its own `precedence.ts` and
  // `config.ts`, 281 lines of which `config.ts` was byte-identical to seniority's. Two
  // copies of a precedence order is two answers to "where did this value come from", and
  // `--explain` is only worth anything if the thing that picked the value is the thing that
  // reports it. The output stack stays denied by name above: colour and progress are things
  // a parser has no reason to carry, where precedence is the parser's own job.
  //
  // `closeout` is the second, admitted on 2026-09-15 on exactly that test, and it passes it
  // the same way. E5 ("SIGINT restores the terminal and exits 130") and O5 ("stdout is
  // flushed before any exit path") are both marked `R` in `.sdlc/intents/burgee/spec.md`,
  // `exit-code.ts` has declared `SIGINT: 130` since the contract was written — and **neither
  // was implemented**. The engine's only exit was `host.exit(code)`, which restores nothing
  // and truncates a pipe by definition. Writing the listener here would have been the fourth
  // copy of one in this repository; the exit is the layer's own job the way precedence is the
  // parser's. `shutdown.ts` is the whole cost: 1,001 B on disk, 51,293 -> 52,683 measured
  // against this unchanged 53,300 with the engine's 389 B of routing, so nothing was raised
  // for it. The output stack stays denied below, `caique` included — prompting is a surface
  // U13 reaches through a guarded dynamic import, not a dependency of the parser.
  // `linegauge` is the third, admitted on 2026-09-15, and it is the same argument a third
  // time. `help.ts` sized its term column, decided which terms overflow it, padded after a
  // term and wrapped every description with `String.length` — the count of UTF-16 code
  // units, which is the column count a terminal draws only for Latin-1. `部署` is two code
  // units and four columns, so a CJK or emoji command name pushed its own description right
  // of the shared column and a CJK description wrapped past the width the caller asked for.
  // `yargs/cliui.ts` has imported the same `width` for the same job since it was ported,
  // and the note under `./yargs` below records what a second copy of a width function
  // costs: it measured a 13-column string as 25. This is the first copy being deleted
  // rather than a fourth being written. Measuring a line is linegauge's own job the way
  // precedence is the parser's and the exit is closeout's, and burgee already declared the
  // dependency. 52,683 -> 52,893 measured, 210 B, against this unchanged 53,300 — the walk
  // stops at a bare import, so linegauge's own bytes are not in that number; what the 210
  // buys is that help stops guessing. Nothing was raised for it.
  //
  // 57,200 on 2026-09-16, for the plugin host, and this is the largest single raise in the
  // file — so it is the one that has to justify itself hardest. `Manifest.use()` validated
  // nothing: it pushed the plugin and called `this.add()` directly, where `defineCommand`
  // enforces the reserved names of V5 and `checkDefinition`. A plugin's command therefore
  // skipped both, and the worst case is not a tidiness one — `toParseConfig` seeds
  // `json: { type: 'boolean' }` and then writes every declared option over the top of it, so a
  // plugin option named `json` **replaced** the envelope flag. On an agent-native CLI whose
  // whole contract is that `--json` is machine-readable output, a third party could take that
  // away from every caller by naming an option, and no check anywhere said so.
  //
  // The cost is **4,191 bytes** (52,959 -> 57,150): `plugin.js` 3,922, `definition.js` 1,563
  // (split out of `validate.js`, which shrank by the same amount), `manifest.js` +38,
  // `index.js` +53, `execute.js` -310 where the reserved-name loop used to be inline. The
  // ceiling is the next hundred above the measurement, as every raise above it is, leaving
  // 50 bytes. It is not paid by a program that declines to call `use()` only in the sense
  // that nothing here is: the validator is reachable from the barrel because `use()` is
  // synchronous, and a deferred one would be a breaking signature change on a published API.
  //
  // What it buys is the whole of `plugin.test.ts`, each case of which was run red first: the
  // `json` option above, `enforce: 'mid'` (accepted, and `NaN` in the comparator), a plugin
  // with no name (accepted, attribution silently lost), a hook with no handler (a `TypeError`
  // one run later), and a contributed path that is already declared (`find()` answered the
  // first node and `resolve()` the last). Four floor families cost about 5 KB each in the
  // notes above; the plugin host is the fifth and costs 4.2.
  //
  // 58,800 on 2026-09-16 for PLAN 2.5.2, `dependsOn` / `exclusive` on the option itself.
  // **+1,621 bytes** (57,150 -> 58,771 measured, against a 57,200 ceiling), and
  // the measurement is a rebuilt `dist`, not the stale one a package-local `vitest run`
  // reads. Where it went, per built file: `manifest.js` +456 (`optionRelations` and
  // `relationsOf`, the desugaring), `definition.js` +504 (a name that is not an option, or is
  // the option itself, is refused when the command is declared), `help.js` +293 (the
  // `(requires --x)` / `(conflicts with --y)` annotations), `schema.js` +281 (the two keys on
  // the option, plus the derived relations reaching the published list), `names.js` +81
  // (`flagsOf`, one helper for three projections that were about to spell it three times),
  // `execute.js` +16, `validate.js` **-10**.
  //
  // It is the alias the plan called it — `exclusive` is `conflicts`, `dependsOn` is `implies`
  // — so there is no second engine here, and that is what keeps the number this small: one
  // `relationsOf` feeds the enforcement and the schema, and the projections are three `if`s.
  // Against it: a constraint the caller could previously only discover by being refused now
  // appears on the option's own help line, in `--schema`'s property for that option, and as
  // Fig's `dependsOn` / `exclusiveOn`.
  //
  // Trimmed before the raise rather than after: sharing `flagsOf` across `schema`, `help`,
  // `completions` and `validate` took 121 bytes off a first measurement of 58,892. Folding the
  // definition-time check into the loop already walking the options saved another 108 and was
  // then given back — `maintainability/cognitive-complexity` scored the merged
  // `checkDefinition` at 30 against a ceiling of 15, and a lint rule this repo enforces
  // outranks 108 bytes.
  //
  // 59,800 on 2026-09-17 for N6: a runnable command that declares no `effects` is refused
  // where it is declared. **+938** (58,794 -> 59,732), attributed per built file:
  // `definition.js` +720 (`checkEffects`, plus the three answers and the fourth as data),
  // `plugin.js` +74, `mcp.js` +70 (the filter now excludes `'withheld'` as well as
  // `undefined`), `execute.js` +74 (`defineCommand` passes the node's `effects` and whether
  // it runs). `manifest.js`, `schema.js` and `index.js` are unchanged to the byte: the new
  // `DeclaredEffects` is a type, and `--schema` already passed `effects` through.
  //
  // What the 938 buys is the removal of a default rather than the addition of a check.
  // `effects` was optional, and a command that omitted it was silently not served as a
  // tool — *I decided agents should not have this* and *I forgot* were the same value, so
  // an author shipped a CLI whose agent-facing half was simply absent, with a shorter
  // `tools/list` as the only evidence. `.sdlc/intents/burgee/spec.md` recorded it as the
  // quieter of the two failures. It is now the louder one, at declaration time, and
  // declining is `effects: 'withheld'` — a thing said rather than a thing forgotten.
  ".": {
    allow: ["closeout", "linegauge", "seniority/precedence"],
    budget: 60_700,
    denied: [
      "testing.js",
      "testing-helpers.js",
      "dev.js",
      "roundel",
      "flagstaff",
      "caique",
    ],
  },
  //
  // `agent-headroom` R1 adds **134 bytes** on top of that (52,035 -> 52,169), inside the same
  // ceiling, and it is the same kind of decision: 134 bytes of core, paid once per install,
  // remove 16,548 bytes from *every* `--schema` an agent reads (39,512 -> 22,964 on the large
  // reference demo). `machineJson` lives in `schema.ts` rather than a module of its own
  // precisely to keep that 134 from being 215.
  // The harness. Test-time only, so a user's shipped CLI never pays for it.
  // Raised from 24,000 with `.` above: the harness reaches the whole engine to run a
  // program in-process, so it carries the renderer too.
  // Raised from 56,000 on 2026-09-08, once: the harness reaches the whole engine, so it
  // carries the theme seam and the fake clock (56,626 measured).
  // 58,300 on 2026-09-13: the harness reaches the schema, so it carries the 395 B above.
  // Measured 58,260.
  // `closeout` arrives here through the engine, and the harness reaches it *detached*: a run
  // that injects its own `exit` gets a registry with no listeners on it, because a harness
  // that attached nine to the test runner's process would exit the runner on the first raised
  // signal. Measured 57,005.
  // `linegauge` arrives here the same way `closeout` does: through the engine, because the
  // harness renders help to assert on it. Measured 57,215.
  // 61,400 on 2026-09-16: the plugin host arrives here through the engine, because the harness
  // runs a whole program in-process and a program may register plugins. +4,090 (57,281 ->
  // 61,371), which is the `.` raise above minus `index.js`, the barrel the harness does not
  // take. Next hundred above the measurement.
  // 63,000 on 2026-09-16 with `.` above: the harness runs a whole program in-process, so it
  // carries `dependsOn`/`exclusive` for the same reason it carries the schema. +1,621
  // (61,371 -> 62,992 measured). Next hundred above the measurement.
  // 63,100 on 2026-09-17, and this is the smallest raise in the file: **23 bytes**, the
  // width of `` from `burgee/plugin` `` added to one refusal's `fix`. That sentence is what
  // an author who never read the README is handed when their plugin declares no contract,
  // and it named `definePlugin` without saying where `definePlugin` lives — the shape
  // `plugin-schema-lock.test.ts` caught in flagstaff. 62,992 had 8 bytes spare, so the
  // ratchet caught a 23-byte string, which is exactly the size of change it exists to make
  // somebody decide about. Measured 63,015.
  // 64,000 on 2026-09-17 with `.` above: the harness runs a whole program in-process, so it
  // carries N6's refusal for the same reason it carries the schema. **+938** (63,015 ->
  // 63,953), the same four files and the same numbers as `.`, minus nothing — the harness
  // takes `index.js` too, and `index.js` did not change.
  "./testing": { allow: ["closeout", "linegauge", "seniority/precedence"], budget: 64_900, denied: ["dev.js"] },
  // The plugin host, at the subpath the rest of the family publishes it at. Added
  // 2026-09-17: burgee was the one package that hosted plugins and published no
  // `./plugin`, so `scripts/plugin-contract-lock.test.ts` had to reach it by relative
  // path and recorded the gap in `NO_PLUGIN_SUBPATH`.
  //
  // It costs a program **nothing**, which is the only reason this entry could be added
  // without raising anything above. `manifest.js` imports `validate` from `plugin.js`
  // as a value — `use()` is synchronous — so every entry that reaches the manifest
  // already carried these bytes. The subpath only gives them a door of their own:
  // 6,301 measured, which is `plugin.js` 3,945 + `definition.js` 2,067 + `names.js` 289,
  // and `allow: []` because the host imports nothing outside the package.
  //
  // Denied the engine in both spellings. A plugin author needs the shape and the
  // refusals; if this entry ever reached `execute.js` it would mean the host had
  // started depending on the runner, and `burgee/plugin` would quietly cost a
  // consumer the whole framework.
  //
  // 7,100 on 2026-09-17 for N6, the definition-time refusal. **+794** (6,301 -> 7,095):
  // `definition.js` +720 for `checkEffects`, the three answers and the fourth, and
  // `plugin.js` +74 where `checkCommands` passes a node's `effects` and whether it runs.
  // This entry pays the largest share of that change in proportional terms and should:
  // the refusal is the plugin host's door as much as `defineCommand`'s, and a plugin's
  // command is read by exactly the code a first-party one is read by.
  "./plugin": {
    allow: [],
    budget: 7_100,
    denied: ["index.js", "execute.js", "testing.js", "testing-helpers.js", "dev.js"],
  },
  // The brand generator. Pure geometry and string building — it must never reach
  // the engine, and the engine must never reach it: a CLI that ships argv parsing
  // has no reason to carry an SVG emitter.
  // The package's own command line. It is allowed to reach the engine — it IS a burgee
  // command, which is the point of it — but a user importing `burgee` must never
  // reach it, which the '.' rule's own denied list would catch.
  // Raised from 60,000 on 2026-09-08: it reaches the whole engine (48 K budget) plus the
  // brand tooling; the engine grew by three floor families this week.
  // Raised from 72,000 on 2026-09-09 for the sibling marks: `shape` (a silhouette other
  // than the swallowtail), `markings` (a second colour on it), `sheen` and `bevel` (the
  // light on it, still and swept). Four options, one clip path and two renderers.
  // 76,500 on 2026-09-16: the package's own command line is a burgee program, so it carries
  // the plugin host for the same reason `.` does. +4,090 (72,360 -> 76,450). Next hundred
  // above the measurement.
  // 78,100 on 2026-09-16 with `.` above: the package's own command line is a burgee program.
  // +1,621 (76,450 -> 78,071 measured). Next hundred above the measurement.
  // 79,100 on 2026-09-17 with `.` above, and 56 of the bytes are this package answering its
  // own question. **+994** (78,094 -> 79,088): the engine's 938, plus `cli.js` +56 for two
  // declarations that had to be made rather than defaulted. `brand` is `non_idempotent`
  // because it overwrites six files in a directory the caller names; `dev` is the first real
  // `'withheld'` in the repository, because it *is* an MCP server — a tool call that started
  // it would be a second, never-finishing server nested inside the first, on the same pipe.
  // Neither declaration existed before this commit, and neither command was a tool.
  "./cli": {
    allow: ["closeout", "linegauge", "roundel/contrast", "seniority/precedence"],
    budget: 80_100,
    denied: ["testing.js", "testing-helpers.js", "dev.js"],
  },
  // Arithmetic over hex strings, and the arithmetic itself is roundel's — colour is the
  // layer below this one, and the WCAG maths lived in both packages until 2026-09-09.
  // Nothing in the engine reaches this: a CLI that ships argv parsing has no reason to
  // carry a contrast checker, which is why `.` still denies `roundel` outright.
  "./contrast": {
    allow: ["roundel/contrast"],
    budget: 12_000,
    denied: ["index.js", "execute.js", "brand.js"],
  },
  "./brand": {
    allow: [],
    budget: 16_000,
    denied: [
      "index.js",
      "execute.js",
      "manifest.js",
      "testing.js",
      "testing-helpers.js",
    ],
  },
  // `allow: []` is the point: the compat front-ends *implement* the incumbents'
  // surfaces over our engine, they do not wrap the real packages, so they import
  // nothing either (J9). Real commander and yargs live only in compat-oracle, which
  // is private and never reaches a user.
  // Raised from 24,000 on 2026-09-07, deliberately and once: the front-end is commander 15
  // ported method for method (graded 1,327/1,331 by commander's own suite), and 24,000 was
  // a placeholder from before it existed. 128,000 is commander's own lib/ (126,365 B), so
  // the lock still proves the front-end is no heavier than the package it replaces.
  // `import 'burgee'` reaches none of it (entry `.` above).
  // The completion templates for four shells and Fig. Loaded by the engine and the
  // commander front-end only on `completion <shell>`, through a dynamic import, so a
  // program pays for them when it prints a script and never at startup (K6).
  "./completions": {
    allow: [],
    budget: 16_000,
    denied: ["index.js", "execute.js", "testing.js", "testing-helpers.js"],
  },
  //
  // Unchanged on 2026-09-16, and that took work. The front-end reaches the manifest and
  // almost nothing else of the engine, so the plugin host landed on it too: 120,144 ->
  // 130,903, **over 128,000**, which would have broken the parity claim in the paragraph
  // above rather than merely spending a budget. 6,409 of that was `validate.js`, pulled in
  // whole for `checkDefinition` — one function of it — while the other four fifths are
  // run-time coercion the front-end never reaches. Splitting the definition-time checks into
  // `definition.js` (1,563 B) is what fixed it: 125,667 measured, and the claim holds.
  //
  // **2026-09-17: `bellpull/cross-spawn`, +1,097 B, and the parity claim above is not true.**
  //
  // The edge is deliberate. `inline-implementation-lock` carried this front-end's hand-rolled
  // spawn as a declared gap with the condition written into it — *"the engine lane adopts it
  // once bellpull grades against cross-spawn's suite"* — and bellpull grades 68 / 68. What the
  // bytes buy is the Windows branch: upstream sends **every** Windows spawn through `node`,
  // which is a workaround for `spawn` not searching `PATHEXT`, and it is simply wrong for a
  // subcommand that is a `.cmd`, a `.bat`, or a shebang that is not node. commander stays
  // 1360 / 1360, measured after the wiring, and `burgee` no longer imports `node:child_process`
  // anywhere — `ChildProcess` comes from bellpull, which re-exports it for this consumer.
  //
  // `spawn` must be read off the namespace at the call site and never captured into a local.
  // commander's own suite mocks `childProcess.spawn` in roughly 23 `executableSubcommand`
  // cases; a binding captured at import never re-syncs, and bellpull's `cross-spawn.ts` reads
  // `spawn` off its own default import for exactly that reason. A named import here undoes it
  // and takes the row from 1360 / 1360 to ungradeable — measured when bellpull was first wired.
  //
  // **704 of the first reading were my own prose.** The walk sums `dist/` bytes and `dist/`
  // keeps doc comments, so the paragraph explaining this change was charged to the budget it
  // was explaining: 128,790 with it, 128,086 without. The explanation lives here, in a test,
  // where it does not ship. Worth remembering before writing an essay in a shipped file.
  //
  // The budget moves to the measurement. The sentence it is checked against does not survive:
  // this entry reached **126,989 B before this change**, against commander's own `lib/` at
  // **125,654** — measured, not quoted. So "parity with commander's 126 KB lib/" was already
  // false by 1,335 B, and the round 128,000 was never a parity bar, only a round number above
  // the then-current reading. It is now 2,432 B over. Recorded rather than smoothed: a budget
  // whose comment claims a property it does not have is worse than no comment, because the
  // next reader spends against a bar that is not there.
  //
  // Unchanged again on 2026-09-17, and this time by 124 bytes. N6 costs the front-end
  // **+864** (127,012 -> 127,876) — `definition.js` +720, `plugin.js` +74, `mcp.js` +70,
  // and none of `execute.js`, which the front-end does not reach. Two things follow and
  // both are worth writing down. The front-end pays for a refusal it can never fire:
  // commander has no notion of effects, its graded suite declares none, and a façade
  // command therefore reaches the manifest without passing `defineCommand`'s door — so a
  // commander user's command is withheld in fact and cannot be made to say so, which is the
  // limit of this change and is recorded in `.sdlc/intents/burgee/spec.md`. And the
  // paragraph above is now the thing to watch: 128,000 is the budget, but commander's own
  // `lib/` is 126,365, and the measurement passed that on 2026-09-16 rather than today.
  // The ceiling says "no heavier than 128,000"; the claim says "no heavier than commander",
  // and those stopped being the same sentence. Not this lane's to reset.
  //
  // **Both landed together, and the combination measures 128,973** — bellpull's +1,097 and
  // N6's +864, less an overlap where both reach `definition.js`. Budget at 129,000. The two
  // paragraphs above disagree about commander's own `lib/` — 125,654 against 126,365 — because
  // they measured different installs of it; either way this entry passed it before today, and
  // the budget has not been a parity bar since.
  //
  // **F2, 2026-09-17: +795 B on the three entries that reach `dispatch`.** `--help --json`
  // printed the same prose as `--help`, so a caller who asked for a machine-readable answer
  // got one they had to parse — the failure the whole `--json` surface exists to avoid, on the
  // flag people type first. The document is `commandSchemaOf` scoped to one node, so the cost
  // is one helper and no second document shape. `./commander` and `./yargs` do not move: the
  // façades answer `--help` themselves.
  //
  // **E3, same day: +140 B on the same three.** `fix` beside `hint` in the failure envelope —
  // the exact flag a caller runs, against the prose a person reads. An agent can execute one
  // and has to interpret the other, and every *plugin* error in the family already carried it.
  "./commander": {
    allow: ["bellpull/cross-spawn"],
    budget: 129_000,
    denied: ["testing.js", "testing-helpers.js", "dev.js"],
  },
  // yargs 18 ported method for method, with its whole dependency tree — yargs-parser 22,
  // cliui 9 (wrap-ansi), y18n 5, escalade, get-caller-file — because burgee depends on
  // nothing outside the family (J9).
  //
  // NOTE: this entry's rule still reads `allow: []`, and that is what the walk observes —
  // but `dist/yargs.js` -> `yargs/shim.js` -> `yargs/cliui.js` -> `linegauge` is a static
  // chain in the built artifact, so the edge is real and this lock does not see it. Left as
  // measured rather than asserted-at, because a rule that disagrees with the walk fails the
  // suite either way; the gap in the walk is the thing to fix, not the number here.
  //
  // `linegauge` is the exception the layering asks for, and it arrived as a bug fix rather
  // than tidying. cliui's port carried its own `stringWidth` and `stripAnsi`, and the strip
  // was wrong: the ITU T.416 sub-parameter form `ESC[38:2::255:0:0m` — what chalk emits for
  // truecolor — left `:2::255:0:0m` in the string and measured 13 columns as 25, so every
  // help screen wrapped against a width that was not the width. linegauge owns measuring
  // text and already fixed it. Two copies of a width function is two answers to how wide
  // the terminal thinks a string is.
  //
  // The parity claim below is unaffected in the direction that matters: the walk stops at a
  // bare import, so linegauge's bytes leave this measurement, and the front-end can only
  // read as *lighter* than the package it replaces, never heavier. 256,000 is what `npm install yargs` puts on disk for the same
  // surface (yargs lib/ 158 K + yargs-parser 52 K + the rest), so the lock proves the
  // front-end is no heavier than the package it replaces. `import 'burgee'` reaches none
  // of it. The 29 locales are JSON read at runtime, not imports, so they are not walked.
  "./yargs": {
    allow: [],
    budget: 256_000,
    denied: ["testing.js", "testing-helpers.js", "dev.js"],
  },
  "./yargs/helpers": {
    allow: [],
    budget: 64_000,
    denied: ["testing.js", "testing-helpers.js", "yargs-factory.js"],
  },
  // yargs-parser alone, for a program that imported it directly; never the factory.
  //
  // 41,900 on 2026-09-15 for the runtime seam (PLAN 4.3, Y9). This is the only entry the
  // seam pushed over, and the arithmetic is the whole story: `yargs-parser.js` is 39,801 and
  // `runtime.js` is 2,020, so the walk reads 41,821 against a 40,000 that had **221 bytes**
  // spare before anything moved. What the 1,972 bought is that this file no longer names
  // `process`: it built its default mixin from `process.env` captured at import and
  // `process.cwd` passed by reference, and yargs' suite replaces the env object per test, so
  // the captured one was a stale read waiting for a test to expose it. The parser entry pays
  // for a seam it uses two members of, which is the honest cost of one file per package
  // rather than one per caller. Ceiling is the next hundred above the measurement, as above.
  "./yargs/parser": {
    allow: [],
    budget: 41_900,
    denied: [
      "testing.js",
      "testing-helpers.js",
      "yargs-factory.js",
      "yargs-shim.js",
    ],
  },
};

/**
 * Static imports are what an entry costs at startup. A dynamic `import('./x.js')` is paid
 * only on the path that runs it (K6), so it is reported as `lazy` and not counted — an
 * entry may defer a rarely used surface without carrying it for every run.
 */
const SPECIFIER = /(?:from|import)\s*'([^']+)'/g;
const LAZY = /import\(\s*'([^']+)'\s*\)/g;

/** One file's imports: static specifiers to follow or count, dynamic ones only to report. */
function scan(source: string): { specs: string[]; lazy: string[] } {
  return {
    specs: [...source.matchAll(SPECIFIER)].map((m) => m[1] ?? ""),
    lazy: [...source.matchAll(LAZY)].map((m) => m[1] ?? ""),
  };
}

function walk(entry: string): {
  reached: string[];
  external: string[];
  bytes: number;
  lazy: string[];
} {
  const files = new Set<string>();
  const external = new Set<string>();
  const lazy = new Set<string>();
  const queue = [entry];
  let bytes = 0;

  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || files.has(file)) continue;
    files.add(file);
    bytes += statSync(file).size;
    const found = scan(readFileSync(file, "utf8"));
    for (const spec of found.lazy) lazy.add(spec);
    for (const spec of found.specs) {
      if (spec.startsWith(".")) queue.push(resolve(dirname(file), spec));
      else if (spec !== "" && !spec.startsWith("node:")) external.add(spec);
    }
  }
  return {
    reached: [...files].map((f) => relative(dist, f)),
    external: [...external],
    bytes,
    lazy: [...lazy],
  };
}

/**
 * A `.js` entry names one dist file exactly. A bare specifier names a package, so it also
 * covers every subpath of it: `roundel` denies `roundel/tokens` too, which a later `allow`
 * entry could otherwise admit through the side door.
 */
function isDenied(name: string, denied: string): boolean {
  if (denied.endsWith(".js")) return name === denied;
  return name === denied || name.startsWith(`${denied}/`);
}

function entryFile(subpath: string): string {
  const conditions = manifest.exports[subpath];
  if (conditions === undefined)
    throw new Error(`no exports entry for ${subpath}`);
  return resolve(pkgRoot, conditions.import);
}

describe.each(Object.keys(RULES))("entry %s", (subpath) => {
  const rule = RULES[subpath] as EntryRule;
  const graph = walk(entryFile(subpath));

  it("imports only what its rule allows", () => {
    expect(graph.external.sort()).toEqual([...rule.allow].sort());
  });

  it("reaches nothing on its denied list", () => {
    // A denied name may be a dist file (the harness) or a bare specifier (the output stack).
    const everything = [...graph.reached, ...graph.external];
    for (const denied of rule.denied)
      expect(everything.filter((name) => isDenied(name, denied))).toEqual([]);
  });

  it("stays inside its byte budget", () => {
    expect(graph.bytes).toBeLessThanOrEqual(rule.budget);
  });
});

describe("the denied list", () => {
  it("denies a subpath of a bare specifier for entry `.`, and a dist file only exactly", () => {
    const rule = RULES["."] as EntryRule;
    const roundel = rule.denied.find((d) => d === "roundel") ?? "";
    expect(isDenied("roundel/tokens", roundel)).toBe(true);
    expect(isDenied("roundel", roundel)).toBe(true);
    expect(isDenied("roundelle", roundel)).toBe(false);
    expect(isDenied("testing-helpers.js", "testing.js")).toBe(false);
  });
});

/**
 * Exports that are data rather than code: the plugin schema a plugin author reads. No import
 * graph and no budget — the file *is* the payload — so a byte rule would measure nothing.
 * Listed rather than pattern-matched so that adding one is still a decision somebody made.
 */
const DATA_EXPORTS = ["./schema.json"];

describe("the lock grows with the package", () => {
  it("every published entry point declares a weight rule", () => {
    // Adding `burgee/commander` without a budget here fails, which is the point:
    // a new surface cannot ship until someone has said what it may weigh.
    const code = Object.keys(manifest.exports).filter(
      (e) => !DATA_EXPORTS.includes(e),
    );
    expect(code.sort()).toEqual(Object.keys(RULES).sort());
  });
});
