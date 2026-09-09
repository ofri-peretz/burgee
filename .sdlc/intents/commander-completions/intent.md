# Intent — `commander-completions`: static completions for four shells, generated from the manifest

> Stage 1 artifact. Child of [`agent-native-cli-layer`](../agent-native-cli-layer/intent.md),
> requirement D2; research §6. Proposes D3–D5.

**Status:** shipped · **Opened:** 2026-09-06 · **Owner:** @ofri-peretz

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

None open. Decided at finalisation (2026-09-06):

- **Floor additions D3–D5 are adopted.**
- **Print-only installation for v1.** `mytool completion zsh` prints the script and one
  line of instruction; no tool edits a user's shell rc file.
