---
"burgee": patch
---

A kebab-case option key is now refused where it is declared, instead of silently never
reaching the handler.

`toParseConfig` kebabs each declared name to build the flag and `canonical` camels every
parsed key back, so the flag layer handed to `resolveLayers` is keyed camelCase while the
specs beside it are keyed as declared. Declare `'dry-run'` and the two never meet: `--dry-run`
parses, resolves to nothing, and the handler is given `undefined`. No error anywhere.

Three of burgee's own commands were live instances. `burgee brand --allow-low-contrast` never
suppressed the WCAG failure it names, `--bordure-width` was always `1.5` whatever was passed,
and `burgee dev --no-watch` still watched. All three are fixed by spelling the key `camelCase`;
the flags are unchanged, and `--bordure-width 7` now reaches the SVG as `stroke-width="14"`
against the default's `3`, `--allow-low-contrast` emits, and `--no-watch` logs no reload when
the entry is edited.

**Breaking for a declaration, not for a command line.** `checkDefinition` refuses a key that
does not survive `camel(kebab(key))` — `'dry-run'`, and also `URL`, whose canonical form is
`url`. It throws through the clash message that was already there, because it is the same
defect: two keys that meet on the command line, one of them written by `kebab()` rather than
by the author. The engine was not taught a second spelling. Threading one through help,
`--schema`, Fig, the env, config and package.json layers and the relation names, to reach a
key that already has exactly one canonical form, is a larger surface than the bug.

**No weight ceiling moved**, which is what D-073 asks for. `./plugin` had 5 bytes of headroom
and a standalone message cost 187, so two things moved to pay for it: V5's reserved names out
of their own loop in `checkCommand` into the pass `checkDefinition` was already making, and
the numeric-bound check out of that loop into the spec helper beside the relation names. Both
read better where they are now — `flag` is computed once and `kebab` is the identity on every
reserved name, and a numeric bound is a fact about a spec rather than about a name.
`definition.js` is 51 bytes smaller than before the check existed. `checkDefinition` now
carries the reserved names; `checkCommand` is still the one door both callers reach.

Found while building `burgee migrate`: it showed up only through the built binary, because
every in-process case had been written camelCase.
