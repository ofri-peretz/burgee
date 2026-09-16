---
'paratext': minor
---

`check()` and `register()` now read `schema.json` rather than one array out of it.

The package's own extension surface accepted this:

```js
{ name: 'x', osc: { nope: true }, when: 'not an object', encode: 'e{text}', fallback: '{text}', extra: 1 }
```

`when` is the one that mattered. `supports()` destructures it, a string destructures to four
`undefined` clauses, every guard falls through, and the answer is `true` — so a capability
with a typo there wrote OSC into whatever the caller had redirected to. Measured on the
published build, `emit()` on a runtime with `isTTY.stdout: false` returned
`"]8;;https://x.devDocs]8;;"`. That is the one failure this package
exists to prevent, reached through its own documented plugin surface.

`src/shape.ts` is a walk over the JSON-Schema keywords the file actually uses — `type`,
`oneOf`, `const`, `minLength`, `minimum`, `items`, `properties` and
`additionalProperties: false` — with no dependency added, because `ajv` is over 100 KB in a
package whose root entry is under 20 KB. It is wired into `capabilityProblems()`, which both
`check()` and `register()` already went through, so the same refusal closes the document path
and the registry path: `register()` is the only way into the registry `emit()` reads, and it
is that refusal, not a guard further down, that keeps a malformed `when` away from
`supports()`. `supports()` additionally answers `false` for a `when` it cannot read, which is
the fail-safe direction rule 6 asks for.

Every refusal names the path it is about — `capabilities.link.when.tty`, not merely the
capability — and carries a code from the family's one vocabulary: `CapabilityError` now has
the `code` that `PluginError` always had, and `plugin.ts` stopped keeping its own copy of
"fallback is required" beside `capability.ts`'s.

**This is a behaviour change for a plugin that was already wrong.** A capability whose `osc`,
`when`, `encode`, `fallback` or `name` does not match the published shape, or that carries a
field the schema does not declare, is now refused at `register()` and reported by `check()`
where it used to pass. Nothing that validated cleanly before is refused now.

What is *not* enforced is written down rather than left to be discovered: `$ref`, `pattern`,
`minItems`, `maxLength`, `enum`, `allOf`, `anyOf` and `not`. None appears under a capability
today, so nothing is silently unchecked — but a keyword added to the schema tomorrow would
be, and the README says so instead of claiming the whole file is validated.
