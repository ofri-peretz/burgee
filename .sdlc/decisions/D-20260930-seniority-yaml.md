---
id: D-20260930-seniority-yaml
subject: 'D-097 left cosmiconfig at 186 / 243 against a control of 240 / 243 because no YAML parser is bundled (constraint 3). The owner''s 1.0 bar is every drop-in level with its incumbent on the incumbent''s own suite. Does seniority keep refusing YAML, or build a parser?'
taken: Taken
date: '2026-09-30'
superseded_by: —
---

**It builds one, inside the family, with no dependency: `seniority/yaml`. `seniority` reads cosmiconfig's YAML with it, and the row goes from 186 / 243 to 240 / 243, level with the control.** This supersedes D-097 on one clause only: *"54 the absent YAML parser (constraint 3, no format parser bundled — the row calls it 'a product decision, not a defect')"*. The rest of D-097 stands, and D-097 is not edited. Constraint 3 is not relaxed either: it forbids *dependencies*, and this adds none. `json5`, `toml` and `ini` stay declined, as the spec's *What seniority deliberately does not do* now says.

**Why the answer changed.** D-097 was right on the bar it had: a parser was a dependency, and `js-yaml` + `json5` + `yaml` + `ini` is 747 M/wk of tree this package would put under every user. The owner then set a different bar, a full 1.0 for every package: every drop-in passes 100% of the incumbent's own suite at its latest release, level with the control. cosmiconfig cannot reach that without YAML. Of its 243 cases, 54 read a `.yaml`, `.yml` or extensionless file with YAML in it, and `import.test.ts` is YAML in all 22. The only route that is not a dependency is to write the parser.

**What was built.**

- `packages/seniority/src/yaml.ts`, exported as `seniority/yaml`: `parse(text)` and `YAMLException`. It covers the part of YAML 1.2 a config file uses: block and flow mappings and sequences, plain, quoted and block scalars, comments, document markers, anchors and aliases, and the core schema. It targets js-yaml 5.4.2, the version cosmiconfig 10.0.1 resolves. That js-yaml loads `CORE_SCHEMA` without `!!merge`, so `<<` is an ordinary key here too. Errors carry js-yaml's reason and position. cosmiconfig's suite asserts three of them word for word: `bad indentation of a mapping entry (1:10)`, `(1:12)` and `(1:13)`.
- It refuses three forms js-yaml reads, each by name: explicit keys written with `?`, an empty key (a line opening with `:`) whose value is a collection on that line, and a `\U` escape past U+10FFFF. None is config-file YAML, and each refusal is a named `YAMLException` with a position, never a wrong value.
- It is **lazy**. `loadYaml` in `cosmiconfig-defaults.ts` `require`s it on the first YAML file, as cosmiconfig `require`s `js-yaml`. It uses `require` because `cosmiconfigSync` calls the same loader, and it uses the package's own name so the one call resolves from `src/` and from `dist/`. No other built module imports it, which `shape.test.ts` asserts. So burgee, which lazily imports `seniority/config`, carries none of it. The weight axis measures burgee at **24,280 / 24,282 B**, unchanged, and no ceiling moved.

**Evidence.**

- **The grade.** cosmiconfig 10.0.1 is the latest release (`npm view cosmiconfig version`, 2026-09-30) and the vendored one. Before: target **186 / 243**, control **240 / 243**. After: target **240 / 243**, control **240 / 243**. The three left are the same three for both: `index.test.ts`, which cannot load for the control either (the declared `controlFailures`), and the linux-only XDG pair (`conditionalCases`). The TAP of both runs was captured with `COMPAT_TAP_DIR`. Every one of the 54 cases that failed with `no YAML parser` now passes.
- **Held to js-yaml, not to itself.** `yaml.test.ts` parses seven real YAML files, six of them this repository's own (hooks, codecov, dependabot, labels, a composite action, a workflow) and one that uses every construct. It also parses tables of scalars, structures and refusals. Every expectation is run a second time through the js-yaml the workspace pins at its root, on every run, and must agree. The rows marked `OURS` must *differ*, so a row cannot claim a divergence that is not there.
- **Wider than the tests.** Off the suite, 1,994 distinct YAML files found on a development machine were each parsed by both. They gave 1,803 identical values, 191 refused by both, and 0 differences. A mutation fuzz of 30,000 edited copies of those files gave 0 differing values and 0 non-`YAMLException` throws. Every case where the two disagreed on *whether* to accept was that empty-key form.
- **Tests that can fail.** A mutation sweep flipped one operator at a time across the parser. The first round had 306 mutants and killed 292. Of the 14 that lived, 5 were equivalent, and the code was simplified so they no longer exist. The other 9 were gaps, each now killed by a new case. The second round had 300 mutants and killed **299**. The one left turns `tab < pos` into `tab <= pos` in the indentation check. That is equivalent, because `pos` is past every blank at that point, so a tab can never sit at `pos`.
- **Coverage** stays at 100 / 100 / 100 / 100 for the package.

**What level sets in motion (D-137).** `burgee migrate` rewrites `cosmiconfig` to `seniority` now that the row is level. `FACADE_EXPORTS.seniority` carries the names the checker sees. The compatibility page, the host note, `GRADED`, the baseline and the docs restate the grade.

**What it costs.** `dist/yaml.js` is 24 KB, under a 25,000 B budget in `shape.test.ts`. burgee's installed size went from 1406 KB to 1435 KB, restated on every page that states it, because an installed tree counts a file whether or not anything loads it. Its bundled size did not move.
