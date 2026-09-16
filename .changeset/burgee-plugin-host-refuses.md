---
'burgee': minor
---

burgee's plugin host now refuses a plugin it cannot host, and a plugin's commands go through
the guards a first-party command goes through. **This is a breaking change to a published
extension point, and it is deliberately a loud one.**

The defect, measured rather than inferred. `definePlugin(plugin)` was `return plugin;`, and
`Manifest.use()` pushed the plugin and called `this.add()` directly — where `defineCommand`
enforces the reserved names of V5 and runs `checkDefinition`. So a plugin's command was
admitted unread, and `toParseConfig` seeds `json: { type: 'boolean' }` and then writes every
declared option over the top of it. **A plugin option named `json` therefore did not clash
with the envelope flag; it replaced it**, on a framework whose entire agent-facing contract is
that `--json` is machine-readable output. Four more were accepted the same way: `enforce:
'mid'` (`NaN` in the hook comparator), a plugin with no `name` (commands carried
`plugin: undefined`, so M3 attribution was silently lost), a hook with no `handler` (a
`TypeError` one run later, classified `RUNTIME`), and a contributed path that was already
declared — which `find()` and `resolve()` answer differently.

**What `contract` means, and how an old plugin fails.** `packages/burgee/src/plugin.ts` is
now a plugin host in the sense the rest of the family means: it owns `Plugin`, `validate()`,
`PluginError` and a `PluginErrorCode` of `E_PLUGIN_SCHEMA | E_PLUGIN_CONTRACT`, both already
in the vocabulary home's union. `contract` is the revision of the family plugin object a
plugin was written against, and this burgee knows `1`. A plugin that declares none is refused
with `E_PLUGIN_CONTRACT` naming the version:

> plugin "acme" declares no contract; burgee 0.6.1 and earlier validated none of it
> — rebuild it against this burgee (`definePlugin` stamps `contract: 1`), or add that key by hand

That refusal is the point rather than a side effect. An object with no `contract` was authored
against a host that checked nothing, so the honest reading of its silence is *unknown*, not
*fine* — and it may be carrying exactly the `json` option above. A silent behaviour change on
a published extension point is worse than a loud breaking one. `definePlugin` now stamps the
contract it was compiled against, so a plugin rebuilt against this release needs no edit, and
only objects built against the unvalidated host are refused.

Two supporting changes. The definition-time checks moved from `validate.ts` to a new
`definition.ts`, because the plugin host pulls them into every graph that reaches the manifest
— including the commander and yargs front-ends, which reach nothing else of the engine.
Importing `validate.js` whole for `checkDefinition` put 6,409 bytes of run-time coercion into
both front-ends and took `burgee/commander` over the 128,000-byte budget that exists to prove
it is no heavier than commander's own `lib/`; the split keeps it at 125,667. And burgee ships
`src/schema.json`, byte-identical to the family's, exported as `burgee/schema.json`.

Measured: `burgee/commander` 1,360 / 1,360 and `burgee/yargs` 804 / 804 against the
incumbents' own suites, unchanged. Core costs 4,191 bytes on disk (52,959 → 57,150), priced
per entry in `weight.test.ts`.
