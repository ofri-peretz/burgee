# Intent — positionals are typed, named and projected like options

> Stage 1 artifact. Opened from the wave-4 ranking
> ([`next-wave-4-2026-10.md`](../../research/next-wave-4-2026-10.md)). Wave 3 rejected it on cost
> and named it for wave 4, after `facade-projection-fidelity`, which it builds on; that intent's
> R3 then opened gap `B-20261012-commander-argument-choices` for exactly this.

**Status:** shipped (2026-10-26, every criterion re-read against `burgee@1.7.2` as installed from npm, [`D-20261026-shipped-on-published-patch`](../../decisions/D-20261026-shipped-on-published-patch.md)) · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz

> Accepted 2026-10-19 by the coordinator under the owner's delegation
> ([`D-20261019-typed-schema-surface-design-accepted`](../../decisions/D-20261019-typed-schema-surface-design-accepted.md)).
> R1–R3 built on `feat/typed-schema-surface`; R4's argument `type` on `inputSchema` and completions
> offering a positional's choices built on `feat/typed-positionals-remainder` (2026-10-26). Every
> criterion holds on `main`. *2026-10-26: shipped. The code is published in `burgee@1.7.2`; see
> § Shipped 2026-10-26.*

---

## What is wanted

`ArgumentSpec` takes `type` (`string`, `number`, `integer`, `boolean`, `file`) and `choices`. A
handler reads `ctx.args.env`, typed from the declaration, beside `ctx.positionals`. A value that
fails its type or choices is a usage error with a `fix`, as an option's is. `--schema`, `--mcp`'s
`inputSchema` and completions carry the type and the `enum`, for native programs and for
`burgee/commander`'s `Argument.choices()`.

## Why now

- **Demand.** yargs #1649, a typed required positional: 10 reactions, 7 comments; citty #115
  (5 reactions), #138 (`number` args, 3 reactions, 3 comments), #80 (2, 2) — counted from the
  2026-09-05 dumps. `commander-schema`'s typed-positionals criterion is unmet (wave 3's rejected
  list).
- **An open gap.** `B-20261012-commander-argument-choices`: commander's
  `new Argument('[env]').choices([...])` is enforced while parsing and reaches no projected
  surface, so an agent's tool definition says `env` is any string.
- **The shape is decided.** D-20261012-typed-positionals-shape.

## Affected users and systems

- `manifest.ts` (`ArgumentSpec`, `RunContext`), `execute.ts` (coercion), `validate.ts`,
  `schema.ts` (`argumentProperty`), `completions.ts`, `mcp.ts`, `commander/` (copy
  `argChoices`), and the types a native program infers.
- Every native program with positionals; every `burgee/commander` program using
  `Argument.choices()`.

## Constraints

- **`ctx.positionals` is unchanged.** `args` is additive.
- **One lane in `execute.ts` at a time**, after `default-command`, `completion-context` and
  `facade-projection-fidelity`.
- **Budgets by rule.** `./commander` is at its ceiling (the gap: 61,132 against 61,100 for the
  smallest version); any raise is the measurement rounded up to 50 B in a dated decision.

## Success criteria

1. `defineCommand({ args: [{ name: 'n', type: 'integer' }] })` gives `ctx.args.n` a `number`
   type and value; `x` is exit 2 with a `fix`.
2. `choices` reach `--schema` (`enum`), `--mcp` `inputSchema` and completions, native and
   commander façade.
3. The gap is closed.

## Shipped — 2026-10-26

**Every criterion holds on the published package.** Version PR #1253 published `burgee@1.7.2` on
2026-10-26 from `main` at `c4230e33` (its `gitHead`), and #1262, which built R4's `type` on
`inputSchema` and the completions, is an ancestor of that commit. It went out as a patch, because
the release window holds a minor's version number and not its code
([`D-20261026-shipped-on-published-patch`](../../decisions/D-20261026-shipped-on-published-patch.md)).
The "stays `approved`" paragraphs below are kept as written.

Every row was run on 2026-10-26 in an empty `mktemp -d` directory after `npm i burgee@1.7.2`,
over a probe program (`deploy` with `arguments: [{ name: 'env', choices: ['staging', 'prod'] },
{ name: 'replicas', type: 'integer' }, { name: 'ratio', type: 'number', required: false, default:
'0.5' }]`, and `fail` with one positional of choices `s m l`). None of it read the workspace.

| Criterion | Command, against `burgee@1.7.2` | Output |
| :-- | :-- | :-- |
| 1. `type: 'integer'` gives `ctx.args.n` a `number`; `x` is exit 2 | `node cli.mjs deploy staging 3 --json`; `… deploy staging x`; `… deploy staging 2.6` | `"args":{"env":"staging","replicas":3,"ratio":0.5}`, `"types":{…"replicas":"number","ratio":"number"}`, `positionals` unchanged as strings, exit 0. `x`: `argument "replicas" expects an integer, got "x"`, the usage line, exit 2. `2.6`: the same refusal with `fix: tp deploy staging 3`, exit 2 |
| 2. `choices` reach `--schema` (`enum`), `--mcp` `inputSchema` and completions, native and façade | `node cli.mjs --schema`; `tools/list` over `--mcp`; `node cli.mjs completion bash\|zsh\|fish\|pwsh`, and the bash script sourced in `/bin/bash` 3.2 with `COMP_WORDS` set; a `burgee/commander` program with `new Argument('<env>').choices(['staging', 'prod'])` | `--schema` and `--mcp` both carry `"env":{"type":"string","enum":["staging","prod"]}`, `"replicas":{"type":"integer"}`, `"ratio":{"type":"number","default":0.5}`, `required: ["env","replicas"]`. TAB: `tp deploy ⇥` offers `staging prod`, `tp deploy s⇥` offers `staging`, `tp deploy staging ⇥` offers nothing, `tp fail ⇥` offers `s m l`. zsh carries `'1: :(staging prod)'`, fish `-a 'staging prod'`, PowerShell `Slots = @{ 1 = @('staging', 'prod') }`. Façade: `deploy dev` is refused while parsing, `--schema` and the `--mcp` tool carry `"enum":["staging","prod"]`, and its bash and zsh scripts offer `staging prod` |
| 3. The gap is closed | `.sdlc/gaps/B-20261012-commander-argument-choices.md` | `status: closed` (#1091) |

## Status (2026-10-26)

| Criterion | State | Check |
| :-- | :-- | :-- |
| 1. `type: 'integer'` gives `ctx.args.n` a `number` type and value; `x` is exit 2 | held. The `fix` follows E3: carried when one value is exact (the rounded integer for `2.6`, the closest choice), and for `x` the refusal teaches the usage line instead (D-20261019-typed-schema-surface-design-accepted) | `packages/burgee/src/typed-positionals.test.ts` › "coerces each declared type, and keeps ctx.positionals as typed"; › "refuses a word that is not an integer, and runs nothing"; › "refuses a fraction for an integer, with the rounded line as the fix" |
| 2. `choices` reach `--schema` (`enum`), `--mcp` `inputSchema` and completions, native and façade | held on `main`, not yet released. `--schema` and `--mcp`: native and façade. Completions: a positional's choices in its slot in bash, zsh, fish and PowerShell, from the manifest, so a façade's `Argument.choices()` too | `packages/burgee/src/typed-positionals.test.ts` › "publishes a native argument's choices as enum, and its requiredness"; › "runs an --mcp call that sends the typed values, and refuses one outside the enum"; › "R4 — completions offer a positional its choices"; `packages/burgee/src/completions-shells.test.ts` › "typed-positionals R4 — each shell offers a positional its choices, in its slot"; `packages/burgee/src/facade-surface.test.ts` › "R3 — an Argument's .choices() is the enum, in --schema and in the MCP tool" |
| 3. The gap is closed | held | `B-20261012-commander-argument-choices` is `status: closed` (#1091) |

**Re-read 2026-10-25 against `burgee@1.7.1` (#1173 released in 1.7.0, Version PR #1231): not
stamped.** Criteria 1 and 3 hold on the released package. Criterion 2 is still short of one surface:
completions do not offer a positional's `choices`, native or façade. Spec R4 also still lacks the
argument's `type` on its `inputSchema` property (an `integer` argument is published as `string`).
Both are what remains before `shipped`.

**2026-10-26: both built** (`feat/typed-positionals-remainder`). Spec R4 now publishes an
argument's JSON type on its `inputSchema` property, `--schema` and `--mcp` alike, and its
`default` as that type (`typed-positionals.test.ts` › "publishes each argument under its JSON
type, and its default as that type", › "lists the typed property in --mcp tools/list"). The
façade ratchets rise 94 B (D-20261026-typed-positionals-r4-weight). Completions are criterion 2's
last surface, above. **The intent stays `approved`** until the burgee minor carrying both
publishes, which is the next Version PR now that there is no release window
(D-20261027-no-release-window). It is stamped `shipped` against
the published package, not against `main`.

Found on the way and fixed: an `--mcp` call that skipped an optional positional shifted every
later value one place left (`packages/burgee/src/typed-positionals.test.ts` › "fills a skipped
optional argument with its default, and stops after the last one given").

## Jev triage

| user_impact | incumbent_gap | risk_reduced | composite | ready_for_spec | needs_model |
| --: | --: | --: | --: | :-- | :-- |
| 3? | 2 | 2? | 17 | yes | no |

## Open questions

- The key set and whether a per-argument JSON Schema is allowed. **Decided 2026-10-12**,
  D-20261012-typed-positionals-shape: no `schema` key.
