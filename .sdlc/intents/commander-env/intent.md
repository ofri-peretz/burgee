# Intent — `commander-env`: one precedence order, and `--explain` says where a value came from

> Stage 1 artifact. Child of [`burgee`](../burgee/intent.md),
> requirements V1–V5; research §3 (config and environment precedence), the second-
> largest cluster after help.

**Status:** approved · **Opened:** 2026-09-06 · **Owner:** @ofri-peretz

> **Accepted at the Design→Build gate 2026-10-25** by the coordinator under the owner's delegation
> ([`D-20261025-commander-env-design-accepted`](../../decisions/D-20261025-commander-env-design-accepted.md)): narrowed to V2 and K3; C3b measured and held as a reading; C1 and R3 dropped. See
> [`spec.md` § Design gate 2026-10-25](./spec.md#design-gate-2026-10-25).

**State assigned 2026-09-09** from repo evidence, at the owner’s direction. **Evidence:** `precedence.ts`, `config.ts`, `env.test.ts` — one order, `--explain`, `meta.provenance`, `extends` (V1–V7).

**Restated:** 2026-10-18 — see § Restated 2026-10-18

---

## Restated 2026-10-18

**The native engine and `seniority` ship the precedence, provenance, `--explain`, discovery and owning-package behaviour with checks; five promised pieces are unbuilt and stay here — REMAINING: C1 (per-issue cases failing on commander), C3 (provenance-task turns vs commander), R3 (`--explain` on the façades), V2 (env names in `--schema`), K3 (discovery order in `--explain`).**

Verified against burgee `main` at `1013b65db5` with `git grep`; no test was run. Nothing is
renumbered.

**What superseded the design.** The intent and `spec.md` describe a `withEnv(program, …)`
`preAction` hook in a new `packages/commander-env`, with a `resolve` and `Provenance` types
in `@interlace/cli-core`, and `meta.provenance` supplied through `commander-agent` /
`yargs-agent`. None of these exist: both `-agent` intents are `dropped`, and there is no
`cli-core` package (the engine is `packages/burgee`). What shipped:

- the resolver lives in **`seniority`**: `packages/seniority/src/precedence.ts` (`ORDER`,
  `resolve`, `envName`, `ConfigError`), `explain.ts` and `config.ts` (discovery,
  `loadWithExtends`);
- the native engine calls it on every run: `packages/burgee/src/execute.ts`,
  re-exported by `packages/burgee/src/config.ts`, with the layers in `config-layers.ts` and
  the owning package in `pkg.ts`.

[`seniority`](../seniority/intent.md) is the peer intent that owns the resolver as a
standalone product. One unbuilt piece of this intent moves there (spec R6, below).

| ID | promised | on main | check | disposition |
| :-- | :-- | :-- | :-- | :-- |
| C1 | a conformance case per listed issue, each failing on plain commander | 9 of 25 cited issues have a test (yargs #873, #1655, #2501, #2005, #1305, #1627, #1363, #1676; oclif/core #1639); no test runs any of them against plain commander | `packages/seniority/src/precedence.test.ts`, `packages/seniority/src/config.test.ts`, `packages/burgee/src/env.test.ts`, `packages/burgee/src/option-relations.test.ts` › "a default does not satisfy it (oclif/core #1639)" | remaining |
| C2 | `--explain <option>` prints the source and every overridden candidate | yes | `packages/burgee/src/env.test.ts` › "--explain \<option> prints the winner and the candidates it beat, and runs nothing"; `packages/seniority/src/precedence.test.ts` › "names the winner and every candidate it beat, unset ones included" | held |
| C3a | `meta.provenance` under `--json` | yes (native engine and `burgee/yargs`) | `packages/burgee/src/env.test.ts` › "config beats the package.json field beats the default, and --json says so (V3)"; › "--dry-run, --no-color and --target-env, not the camelCase keys"; `packages/burgee/src/yargs/burgee.test.ts` › "wraps the handler return value with provenance" | held |
| C3b | provenance task median turns drop vs the ~~`LAYER=off` build~~ commander variant | the `LAYER=off` build is gone with the `-agent` layers; B1 now compares the `burgee` variant with `commander` (`benchmarks/axes/agent.ts`) and does not gate per-task turns | none located | restated, remaining |
| C4 | `--version` inside `examples/` prints the demo's version, not the root's | the `examples/` tree cannot tell them apart: the root and every demo are `0.0.0`. Restated to the same discrimination on synthetic nested packages | `packages/burgee/src/owning-package.test.ts` › "finds the CLI's own package.json, not the installing project's"; `packages/burgee/src/bin-link-version.test.ts` › "prints burgee's own version, not the installing project's"; `packages/burgee/src/env.test.ts` › "--version reads the package.json that owns the entry file (V4), unless the program declares one" | restated |
| V2 | env names documented in help and `--schema` (§ What is wanted) | help: yes. `--schema`: `schema.ts` passes `options` through, `env` included, but no test asserts it | `packages/burgee/src/help.test.ts` › "annotates defaults, choices, env and placeholder in a stable order (R4, yargs #1408, #833, #1935)"; `--schema`: none located | help held; `--schema` remaining |
| K3 | discovery order is itself in `--explain` (constraint 3) | no: `--explain` names the winning file; `config explain` prints the precedence `ORDER`, not the file-discovery order | none located | remaining |

The spec's R1–R7 are restated in [`spec.md` § Restated 2026-10-18](./spec.md#restated-2026-10-18).
R3's façade half (`--explain` on `burgee/commander` and `burgee/yargs`) is remaining here.
`facade-gets-more/spec.md` (renamed from `design.md` when it shipped) § Out of scope declines it ("`--help --json` (F2) and
`--explain` (V3) on the façades"), so no other intent owns it.

**Stale finding corrected.** § Verified against `main` — 2026-09-09 says
`demo-cli-burgee --version` exits 2 with `unknown command`. That is fixed on main: a root
`--version` resolves the owning package
(`packages/burgee/src/execute-paths.test.ts` › "finds the version beside the working
directory when there is neither an entry nor a script").

## What is wanted

Every value a command sees comes from exactly one place, in one documented order —
**flag > env > config file > package.json field > default** — and the CLI can say which:

```text
$ mytool deploy --explain region
region = "eu-1"   from config file ./mytool.config.json (key "region")
         overridden candidates: env REGION (unset), default "us-1"
```

with the same information as `meta.provenance` under `--json` (V3), env names
documented in help and `--schema` (V2), env scoped to the command that declares it
(V1), config files with nesting, `extends`, `--no-config` and async loaders, and
`name`/`version` read from the **owning** `package.json` (V4).

## Why now

- **The precedence cluster is 25 open yargs issues, some nine years old.** #873 (22
  comments) env vars break strict mode for unrelated commands; #821 arrays from env;
  #1655 explicit env names; #2501 `--no-` from env; #2005 SCREAMING_CASE camel-cased
  unexpectedly; #858/#1782/#2472/#1858 config for subcommands, nested keys, strict
  mode; #1305/#1627 dot-notation and deep merge; #2234 async config; #1363/#1135
  `extends` semantics; #1676 `--no-config` still loads; #2191 `pkgConf` only once;
  #1234 "load a user config if it exists".
- **Provenance is asked for by three trackers and shipped by none.** yargs #1334 "track
  which arguments have been defaulted"; oclif/core #854 "hard to tell whether a user
  really typed that flag"; oclif/core #1639 `dependsOn` satisfied by a default.
- **The version bug is universal.** yargs #2400 and #1934, commander #2346, citty #200:
  reading the wrong `package.json` in monorepos and global installs.
- **For agents, provenance is the difference between one call and five.** Task 3 of
  the benchmark (intent 5) measures exactly this.

## Affected users and systems

- ~~New `packages/commander-env`; `@interlace/cli-core` gains `Provenance` types and the
  merge algorithm (host-neutral; yargs has `.env()`/`.config()` natively and gets only
  `--explain` and provenance via `yargs-agent`).~~ **Restated 2026-10-18:**
  `packages/seniority` (resolver, explain, discovery) and `packages/burgee` (the engine
  that calls it).
- ~~`commander-agent` envelope `meta.provenance` (deferred there to here).~~ The engine's
  own `--json` envelope; `commander-agent` is dropped.
- `commander-schema` `env:` field is the declaration this package reads. **2026-10-18:**
  it is `OptionSpec.env` in the engine's option declaration.

## Constraints

1. Precedence is fixed and not configurable; configurability is what made yargs'
   `parserConfiguration` a 30-flag surface.
2. Env applies only to options the **running** command (and its ancestors) declare;
   never to sibling commands (yargs #873).
3. Config discovery: explicit `--config <path>` > `MYTOOL_CONFIG` > `./mytool.config.
   {json,yaml,js,ts}` > `package.json#mytool` > user config dir. Discovery order is
   itself in `--explain`. **Restated 2026-10-18:** shipped as `./name.config.{json,mjs,js,cjs}`.
   YAML and other formats are injected loaders in `seniority` (`seniority/yaml`), and `.ts`
   is not loaded. The order is held by `packages/seniority/src/config.test.ts` › "lists
   explicit env, the cwd files by extension, then the user directory". The last sentence
   (order shown by `--explain`) is not built: remaining as K3 in § Restated 2026-10-18.
4. Loaders are async and may be ESM (`.js`/`.ts` via `import()`), answering yargs #2234
   and #2479.

## Success criteria

- Conformance case per issue listed; each fails on plain commander. **(C1, 2026-10-18:
  remaining — 9 of 25 cited, none run against commander.)**
- `--explain <option>` on the demo prints the source and every overridden candidate.
  **(C2, 2026-10-18: held.)**
- `meta.provenance` present under `--json`; the benchmark's provenance task median
  turns drop versus the ~~`LAYER=off` build~~ commander variant. **(C3, 2026-10-18:
  provenance held; the benchmark half restated and remaining.)**
- `mytool --version` inside `examples/` (a monorepo) prints the demo's version, not the
  root's (V4). **(C4, 2026-10-18: restated to synthetic nested packages, because the root
  and every demo CLI `package.json` say `0.0.0`; held.)**

## Verified against `main` — 2026-09-09

Checked criterion by criterion on `61bd11b9`. **One of four met.** The status stays `review`.
The shipped behaviour is strong; the criteria as written are not satisfied.

- **A conformance case per issue listed, each failing on plain commander** — not met. Eight
  issues are cited across `precedence.test.ts`, `config.test.ts` and `env.test.ts` (#873, #1305,
  #1363, #1627, #1655, #1676, #2005, #2501) out of roughly twenty-four named here; all 35 tests
  pass. And no "fails on plain commander" assertion exists anywhere, so the differential half is
  unbuilt.
- **`--explain <option>` prints the source and every overridden candidate** — **met.**
  `demo-cli-burgee greet Ada --explain greeting` prints
  `greeting = "Hello"   from default` above `candidates: flag --greeting (unset), env
  DEMO_GREETING (unset)` and exits 0, backed by two tests.
- **`meta.provenance` under `--json`; the provenance task's median turns drop against
  `LAYER=off`** — half. Provenance is live and correct. The benchmark half is not measurable:
  there is no benchmark, and `LAYER` appears nowhere in the repo.
- **`mytool --version` inside `examples/` prints the demo's version, not the root's (V4)** —
  **not met, and not demonstrable here.** `demo-cli-burgee --version` returns
  `error: unknown command "--version"` with exit 2 — the engine only handles `--version` once a
  command resolves. And the discrimination cannot be shown in this monorepo anyway: the root and
  all three demos are `version: "0.0.0"`. The V4 mechanism is real and tested (`pkg.ts`
  `nearestPackage`), but against a synthetic tmpdir, not the `examples/` tree the criterion names.

## Open questions

Decided — none open. The items below were settled when this intent was written and are
kept as the record they always were (confirmed 2026-09-20, D-072).

None open. Decided at finalisation (2026-09-06):

- Decided: **Floor additions V6–V7 are adopted.**
- Decided: **Env→array parsing uses the option's declared `separator`**, default `,`; an option
  with `multiple: false` receiving a separator-bearing env value is a `CONFIG` error
  with a `fix`, not a silent string.

## Incumbents

`commander, yargs` — the trackers whose issues are this surface's demand signal, and the input
`scripts/mine-issues.ts` (PLAN 4.1) needs in order to write the `issues.md` beside this file.

It is declared here because the miner's own `LAYERS` table, in
`packages/compat-oracle/src/demand.ts`, knows the nine *packages* and not the surfaces of any
one of them: `burgee`'s entry names `commander` and `yargs` for the whole package, and the six
surface intents are not in the table at all. Until that table reads this line,
`npx tsx scripts/mine-issues.ts commander-env` answers `no layer matched`.

Chosen from evidence rather than from the slug, which is the reason to write it down at all.
The rule: **the front-end this surface adapts, plus every other tracker this intent's own body
cites three or more times.** Here that is `commander`, and `yargs`, which it cites eight times. Trackers cited once or twice
(citty) are comparisons this intent draws, not incumbents it replaces; mining them would file
issues under a surface no criterion here answers.

<!-- incumbents: commander, yargs -->
