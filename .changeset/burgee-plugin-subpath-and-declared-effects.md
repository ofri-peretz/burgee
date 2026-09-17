---
'burgee': minor
---

burgee's extension surface: `./plugin` is published, and `effects` is no longer optional.

**`burgee/plugin`.** Every other host in the family publishes its plugin module at
`<host>/plugin` — `bellpull`, `caique`, `closeout`, `flagstaff`, `paratext`, `roundel`,
`seniority`. burgee, the package that declares the plugin shape the other seven register
against, did not, so `scripts/plugin-contract-lock.test.ts` had to reach it by relative path
and recorded the gap as a declared one. It is the shape `plugin-schema-lock` caught in
flagstaff — a host whose own refusal names something the author cannot reach — and burgee's
version was the quieter kind, because the `fix` named no specifier at all: it said *rebuild
it against this burgee, `definePlugin` stamps the contract*, and left the author to work out
where `definePlugin` lives. The convention the family teaches is `burgee/plugin`, and that
threw `ERR_PACKAGE_PATH_NOT_EXPORTED`. Both halves are fixed: the subpath resolves, and the
message says its name. `burgee/plugin` exports `CONTRACT`, `definePlugin`, `validate`,
`PluginError`, `Plugin` and `PluginErrorCode`; the root barrel keeps the four it always
carried, because one module behind two doors is what `burgee/yargs` and
`burgee/yargs/helpers` already are, and `Manifest.use(plugin: Plugin)` is a root export.
`validate()` and the `Plugin` interface are the half only the subpath carries — the host's
vocabulary rather than a program author's.

**`effects` is required on a command that runs — a breaking change.** Any CLI with an
un-annotated runnable command will now fail at definition time rather than starting. The
one-line migration: add `effects: 'withheld'` to every runnable command that declared none,
then replace it with `read_only`, `idempotent` or `non_idempotent` on each command an agent
should be able to call.

It is breaking on purpose, because the old behaviour was silent. `toolsOf` serves only a
command that declared its `effects`, and that filter is right and unchanged: an agent gaining
shell-equivalent power over a CLI nobody meant to publish is a security posture, not a
convenience. What was wrong is that its input had one spelling for two different things.
*I decided agents should not have this* and *I forgot* both arrived as `undefined`, so the
second shipped as the first — you released, and the tool you built for an agent simply was
not in `tools/list`, with a shorter list than you expected as the only evidence.

So `effects` has no default, and declining is something an author writes down:
`effects: 'withheld'`, a fourth value of the same field. Not `'none'`, which reads as *this
command has no effects* — that is `read_only`, the one value it could be confused with. Not a
second boolean field either: beside a now-required `effects` that would mean declaring what a
command does to the world silently opts it into the tool list, and the new field's default
would be the silence this change removes. One field, four answers, no default, and therefore
no state in which forgetting is possible.

The three projections then disagree on purpose, each correctly. `--schema` publishes
`effects: "withheld"`, because an agent reading a program as data is better served by *this
exists and is not for you* than by a gap it cannot tell from a command that does not exist.
`tools/list` omits it. The Fig spec and the shell completions carry it exactly as before —
nothing in `completions.ts` reads `effects` and nothing here makes it start, because
withholding is about agents and a person typing at a terminal is not one.

Two limits, stated rather than implied. The refusal is on burgee's own declaration API:
a command built through `burgee/commander` or `burgee/yargs` reaches the manifest without
passing that door, because neither incumbent has a notion of effects and their graded suites
declare none — commander **1360 / 1360** and yargs **804 / 804**, both unchanged by this
release — so a façade user's command is withheld in fact and cannot be made to say so. And
`effects` stays optional on the TypeScript type, because a field whose presence depends on a
sibling's would mean splitting `Command` into a union at the cost of the option-spec
inference every caller relies on; the check is at definition time, not at compile time.

`burgee dev` is the first command in this repository to declare `'withheld'`, and not as a
formality: `dev` **is** an MCP server, so a tool call that started it would be a second,
never-finishing server nested inside the first, on the same pipe. `burgee brand` declares
`non_idempotent`, because it overwrites six files in a directory the caller names.

Weight, measured on a forced rebuild rather than a cached `dist/`: the core entry goes
58,771 → 59,732 bytes on disk (`+961` over both changes, of which `+938` is the refusal),
`burgee/testing` 62,992 → 63,953, `burgee/cli` 78,071 → 79,088, `burgee/commander`
126,989 → 127,876 inside its unchanged 128,000, and `burgee/yargs` 230,869 → 231,756 inside
its unchanged 256,000. The new `burgee/plugin` entry is 7,095 and costs a program nothing:
`manifest.js` imports `validate` as a value because `use()` is synchronous, so every entry
that reaches the manifest already carried those bytes.
