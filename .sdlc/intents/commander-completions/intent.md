# Intent — `commander-completions`: static completions for four shells, generated from the manifest

> Stage 1 artifact. Child of [`burgee`](../burgee/intent.md),
> requirement D2; research §6. Proposes D3–D5.

**Status:** shipped · **Opened:** 2026-09-06 · **Owner:** @ofri-peretz · **Shipped:** 2026-10-18 on [`1013b65db5`](https://github.com/ofri-peretz/burgee/commit/1013b65db5), verified against `main` at `1013b65db5` — all 3 criteria locked by the completions suites and `completions.yml` · approved and shipped 2026-10-18, accepted under the owner's 2026-10-12 delegation

**State assigned 2026-09-09** from repo evidence, at the owner’s direction. **Evidence:** `completions.ts` + the `./completions` export + `completions.yml`; four shells and a Fig spec (D2–D5).

---

## What is wanted

`mytool completion bash|zsh|fish|pwsh` prints a **static** completion script generated
from the F1 manifest — commands, subcommands, options, `--no-` variants, choices,
descriptions as completion hints — that never runs Node on TAB. A `--dynamic` escape
hatch calls back into the CLI for values that must be live (yargs #2390), and a Fig
spec export (yargs #2131, #2126, citty #59) comes from the same node.

## Why now

- **commander ships no completions at all**; yargs' are dynamic and slow (#1684 "runs
  node and compiles with babel each time tab is pressed"), bash/zsh only (#1904 fish,
  20 reactions; #1290/#1210 PowerShell), and buggy: #1965 pressing TAB **runs the
  command**, #2254 `--no-x` not completed, #1277 subcommands offered at the wrong
  level, #1133 suggestions interfere, #1886 commands missing, #2300 impossible to
  debug.
- **Static generation is only possible when the CLI is data.** F1 makes it a
  template pass; every bug above is a symptom of completions being computed at
  keystroke time by the parser.
- citty #217, #168 and #59 are the same requests on the newest parser in the set.

## Affected users and systems

- New `packages/commander-completions` (the yargs side is `yargs-completions`, free on
  npm, if yargs' own `.completion()` is judged insufficient after `yargs-agent`).
- `@interlace/cli-core/src/completions/` templates, host-neutral.
- The docs site: an install snippet per shell.

## Constraints

1. Generated scripts are pure shell: no `node` invocation except under `--dynamic`.
2. Scripts are deterministic for a manifest; a snapshot suite pins each shell.
3. Tested by running each shell in CI (`bash`, `zsh`, `fish`, `pwsh` are all on
   `ubuntu-latest`) against the demo with a scripted TAB, not by eyeballing.

## Success criteria

- Four shells, each with a CI test that completes `mytool con<TAB>` → `config`, `mytool
  config get --<TAB>` lists options with descriptions where the shell supports them,
  and `--no-<TAB>` offers negations.
- TAB never executes a command (yargs #1965): a CI case asserts the demo's handler
  sentinel is not written during completion.
- `mytool completion fig` validates against Fig's spec schema.

## Shipped — 2026-10-18

**Status raised to `shipped`.** Every criterion was checked against `main` at `1013b65db5` in the
roadmap-to-shipped Batch 0 pass (`.sdlc/research/roadmap-to-shipped-2026-10.md`).

Accepted at Design→Build under the owner's 2026-10-12 delegation, with two criteria **restated to
what was built**. The 2026-09-09 reading below found them unmet as written. Both restatements are
named here and not quietly reinterpreted.

- **Restated: `--dynamic` is a per-option `complete`.** D-119 replaced the escape hatch with a
  `complete` function on the option that needs live values. The script calls the program back, as
  `prog __complete <option> <partial>`, only for that option. Every other option stays static.
  D3 still holds for everything not declared.
- **Restated: "validates against Fig's spec schema" is a structural check against Fig's own
  vocabulary.** Fig publishes no JSON Schema. `@withfig/autocomplete-types` 1.31.0 ships only an
  `index.d.ts`, as `fig-schema.test.ts` records. The check is that every key is one Fig declares,
  on the node type that declares it (`fig-schema.test.ts`), and that the spec and the parser
  describe the same program (`fig-spec.test.ts`).

| criterion | check | result |
| :-- | :-- | :-- |
| 1. four shells: `con<TAB>` → `config`, options with descriptions, `--no-<TAB>` negations | `completions.test.ts` (bash through `COMP_WORDS`, zsh through a real PTY, fish `complete -C`, pwsh `TabExpansion2`); `completion-flags.test.ts` (each shell's script offers `--no-dry-run` and `--no-quiet` and nothing the parser refuses) | 97 passed, 2 skipped locally; `completions.yml` on `main`: the last three runs green (39163516178, 39163131101, 39162295634), which run pwsh, zsh and fish |
| 2. TAB never executes a command | `completions.test.ts` (D3 sentinel), `completions-dynamic.test.ts` (only a declared completer calls back) | the same run |
| 3. Fig spec, restated as above | `fig-schema.test.ts`, `fig-spec.test.ts`, `commander/surfaces.test.ts` | the same run |

The live-shell negation assertion runs in bash. zsh, fish and pwsh are held to the same set at the
script level by `completion-flags.test.ts`, which runs the parser on every flag each script offers.

## Verified against `main` — 2026-09-09

Checked criterion by criterion on `61bd11b9`. **One of three met.** The status stays `review`.
Completions ship for five shells and the workflow drives real shells; each of the two open
criteria fails on one specific clause rather than wholesale.

- **Four shells, each with a CI test for `con<TAB>` → `config`, `--<TAB>` listing options with
  descriptions, and `--no-<TAB>` offering negations** — partly met; the negation clause is
  **not met at all**. `.github/workflows/completions.yml` installs zsh and fish and runs all four
  on ubuntu; locally 10 pass and 1 skips (no pwsh on macOS). zsh is driven through a real
  pseudo-terminal and asserts the description text appears. But **negations do not exist**:
  `packages/burgee/src/completions.ts` has no `no-` handling, `OptionSpec` has no negation
  concept, and `completion fish` emits no `--no-*` lines.
- **TAB never executes a command (yargs #1965), asserted by a handler sentinel** — **met.**
  `completions.test.ts:73` asserts, for every shell, that the emitted script matches no
  command-invoking pattern and that the `HANDLER-RAN` sentinel never appears; the bash and zsh
  live-shell tests assert the sentinel is absent from real TAB output too.
- **`completion fig` validates against Fig's spec schema** — **not met as written.**
  `completion fig` emits 2,525 bytes of valid JSON and is covered by a `toMatchObject` plus a
  snapshot, but there is no Fig schema validation: no `@withfig/*` dependency and no schema file,
  so a spec-invalid field would pass.

Also unbuilt, though not a criterion: the `--dynamic` escape hatch named under "What is wanted".

## Open questions

Decided — none open. The items below were settled when this intent was written and are
kept as the record they always were (confirmed 2026-09-20, D-072).

None open. Decided at finalisation (2026-09-06):

- Decided: **Floor additions D3–D5 are adopted.**
- Decided: **Print-only installation for v1.** `mytool completion zsh` prints the script and one
  line of instruction; no tool edits a user's shell rc file.

## Incumbents

`commander, yargs` — the trackers whose issues are this surface's demand signal, and the input
`scripts/mine-issues.ts` (PLAN 4.1) needs in order to write the `issues.md` beside this file.

It is declared here because the miner's own `LAYERS` table, in
`packages/compat-oracle/src/demand.ts`, knows the nine *packages* and not the surfaces of any
one of them: `burgee`'s entry names `commander` and `yargs` for the whole package, and the six
surface intents are not in the table at all. Until that table reads this line,
`npx tsx scripts/mine-issues.ts commander-completions` answers `no layer matched`.

Chosen from evidence rather than from the slug, which is the reason to write it down at all.
The rule: **the front-end this surface adapts, plus every other tracker this intent's own body
cites three or more times.** Here that is `commander`, and `yargs`, which it cites five times. Trackers cited once or twice
(citty) are comparisons this intent draws, not incumbents it replaces; mining them would file
issues under a surface no criterion here answers.

<!-- incumbents: commander, yargs -->
