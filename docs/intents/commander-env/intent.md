# Intent — `commander-env`: one precedence order, and `--explain` says where a value came from

> Stage 1 artifact. Child of [`agent-native-cli-layer`](../agent-native-cli-layer/intent.md),
> requirements V1–V5; research §3 (config and environment precedence), the second-
> largest cluster after help.

**Status:** review · **Opened:** 2026-09-06 · **Owner:** @ofri-peretz

---

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

- New `packages/commander-env`; `@interlace/cli-core` gains `Provenance` types and the
  merge algorithm (host-neutral; yargs has `.env()`/`.config()` natively and gets only
  `--explain` and provenance via `yargs-agent`).
- `commander-agent` envelope `meta.provenance` (deferred there to here).
- `commander-schema` `env:` field is the declaration this package reads.

## Constraints

1. Precedence is fixed and not configurable; configurability is what made yargs'
   `parserConfiguration` a 30-flag surface.
2. Env applies only to options the **running** command (and its ancestors) declare;
   never to sibling commands (yargs #873).
3. Config discovery: explicit `--config <path>` > `MYTOOL_CONFIG` > `./mytool.config.
   {json,yaml,js,ts}` > `package.json#mytool` > user config dir. Discovery order is
   itself in `--explain`.
4. Loaders are async and may be ESM (`.js`/`.ts` via `import()`), answering yargs #2234
   and #2479.

## Success criteria

- Conformance case per issue listed; each fails on plain commander.
- `--explain <option>` on the demo prints the source and every overridden candidate.
- `meta.provenance` present under `--json`; the benchmark's provenance task median
  turns drop versus the `LAYER=off` build.
- `mytool --version` inside `examples/` (a monorepo) prints the demo's version, not the
  root's (V4).

## Open questions

None open. Decided at finalisation (2026-09-06):

- **Floor additions V6–V7 are adopted.**
- **Env→array parsing uses the option's declared `separator`**, default `,`; an option
  with `multiple: false` receiving a separator-bearing env value is a `CONFIG` error
  with a `fix`, not a silent string.
