# paratext

## 0.4.0

### Minor Changes

- [#380](https://github.com/ofri-peretz/burgee/pull/380) [`f3224f4`](https://github.com/ofri-peretz/burgee/commit/f3224f4f43da21bbeeac931c2ec8afc50f0c3235) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `paratext/term-img` — the `term-img` surface as a drop-in subpath.

  `terminalImage(image, options?)` and `UnsupportedTerminalError`, graded at **12 / 18**
  against term-img's own suite, up from 0. A subpath rather than the package root because the
  root default export is already `ansi-escapes`' object and term-img's default export is a
  function — one default cannot be both, which is why the row measured zero: its whole TAP was
  a `SyntaxError` about a missing named export, not eighteen failing behaviours.

  The six cases that stay red are one decision. `term-img` accepts a **path** and reads it;
  this package takes bytes only, so that `node:fs` stays out of a package that otherwise
  touches nothing but strings. The refusal is a `TypeError` thrown at exactly the point
  upstream would have opened the file, which is what keeps the four path-to-an-unsupported-
  terminal cases passing. `terminalImage(await readFile(path))` is the migration.

  The five-terminal support table is term-img's own — iTerm2 ≥ 3, WezTerm ≥ 20220319,
  Konsole ≥ 22.04, Rio ≥ 0.1.13, VSCode ≥ 1.80 — read from the environment, with no
  `iterm2-version` and no `ansi-escapes` behind it, and with upstream's iTerm2 major-version
  comparison corrected so that 10.x is not read as 1.x.

  The OSC 1337 record moved from `builtins.ts` into its own module so the new subpath can
  reach it without loading the plugin registry. `paratext`'s exported `image` capability is
  the same object it always was.

- [#372](https://github.com/ofri-peretz/burgee/pull/372) [`2f6cb16`](https://github.com/ofri-peretz/burgee/commit/2f6cb160f488668c56d61e3e3f0ed612137295af) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `paratext/terminal-link` — the `terminal-link` surface as a drop-in subpath.

  `terminalLink(text, url, options?)`, `terminalLink.stderr`, and `isSupported` on both,
  graded at **8 / 10** against terminal-link's own suite, up from 0. A subpath rather than the
  package root because the root default export is already `ansi-escapes`' object and
  terminal-link's default export is a function — one default cannot be both.

  `Runtime.isTTY` gains an optional `stderr`, since this façade's whole surface is a pair and
  deciding both streams from one would answer the wrong question for half the API.

### Patch Changes

- [#373](https://github.com/ofri-peretz/burgee/pull/373) [`a1f1d40`](https://github.com/ofri-peretz/burgee/commit/a1f1d40b7d1e7244f3a180943b641bb3b491d256) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Stage 2's artifact is now `spec.md`, the name Anthropic's AI-Native SDLC playbook gives it, so the source comments and README sections that cite a package's own design document point at `spec.md` rather than `design.md`.

  No behaviour changes. The published tarballs do move, by two bytes per surviving reference — `design.md` is nine characters and `spec.md` is seven — so the four packages carrying a weight band were re-measured against it: linegauge 83,538 to 83,536; paratext 66,343 to 66,341; closeout 84,455 to 84,453; bellpull 86,113 to 86,107.

## 0.3.0

### Minor Changes

- [#316](https://github.com/ofri-peretz/burgee/pull/316) [`c8acb28`](https://github.com/ofri-peretz/burgee/commit/c8acb2848714a1cbe3e26a2f9895d7498fb4f096) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `paratext` is now call-compatible with `ansi-escapes` for the four OSC members of its surface — `link`, `image`, `setCwd`, `beep` — as both a default export and named exports (`paratext/design.md` R8). The bytes are the incumbent's where the terminal understands them, and the static projection everywhere else: `Docs (https://x.dev)` for a link, the caption for an image, nothing for a `setCwd`. That difference is the reason to swap, and it is the difference between a pipe receiving something readable and a pipe receiving `\u001B]1337;File=inline=1;…`.

  Its **CSI half stays out of scope** — the cursor, erasing, scroll regions, the alternate screen, which `flagstaff` draws and `closeout` puts back. Those thirty-three names are nonetheless _declared_, as `undefined`, because ESM refuses a named import of a name a module does not export: without them `import ansiEscapes, { cursorTo } from 'paratext'` was a `SyntaxError` that took the whole file down before a line of it ran. TypeScript types them so that calling one is a compile error rather than a run-time surprise. Graded against `ansi-escapes@7.3.0`'s own suite the row moves **0 / 4 to 1 / 4**, which is its ceiling: three of its four cases assert CSI, so 25% there means complete.

  **Two root exports changed shape.** `link` and `image` are now the incumbent's _functions_ rather than this package's capability _records_, because a caller who swapped one import specifier would otherwise have got an object shaped nothing like a function, silently. The rule is stated rather than case-by-case — a record export survives unless `ansi-escapes` has that name — so `bell`, `clipboard`, `cwd`, `notify` and `title` are unchanged. The two that moved are reached as `capability('link')` and `capability('image')`, or through `builtins`.

  `image`'s encode template gained `preserveAspectRatio` and `size`, upstream's last two options in upstream's order, so `image()` is byte-identical to the incumbent rather than merely call-compatible. `size` is optional in the protocol and required by xterm.js, which is why upstream always writes it.

  New subpath **`paratext/plugin`**: paratext hosts `capabilities` (`plugin-contract` R5a). A plugin object registers, every key another layer owns is ignored without complaint, and `attach()` hands the contributions to the same `register()` the built-ins go through — so a third party's capability is not a second-class citizen of the registry. Refusals use the family vocabulary: `E_PLUGIN_SCHEMA`, `E_PLUGIN_CONTRACT`, and `E_NO_STATIC_PROJECTION` for a capability with no `fallback`, which is the same defect flagstaff raises it for in a component and caique in a widget.

  `Runtime` gained an optional `cwd`, which is the only thing `setCwd()` needs to default the way the incumbent defaults it to `process.cwd()` — and the way to add it without a second `process` reference in the package.

- [#294](https://github.com/ofri-peretz/burgee/pull/294) [`3f92a60`](https://github.com/ofri-peretz/burgee/commit/3f92a6099b1b8d5d476c64405ca963d40bf9af45) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - paratext validates against the family plugin schema, with its shape under `capabilities`.

  paratext shipped its own `schema.json` whose root _was_ one capability, so the family had
  three plugin schemas where the contract says one (PRINCIPLES 14, `plugin-contract` R2).
  The capability shape is now `$defs/capability` of the shared file, reached through a
  `capabilities` key beside `spinners`, `tokens` and `components`, and
  `packages/*/src/schema.json` hashes to one value. flagstaff and roundel ship the same
  bytes: their published `./schema.json` gains the capability definitions and nothing about
  what they validate changes.

  `check()` follows the schema's `$defs/capabilityDocument` and takes either shape:

  - a plugin carrying its capabilities under `capabilities`, which is where they live from
    now on, and whose problems are reported at `capabilities.<key>`;
  - **deprecated** — one capability written as the whole document, which is what a 0.2
    capability file looks like. It still validates, and `check()` returns a `deprecated:`
    line saying to move it under `capabilities`. paratext 1.0 stops accepting it
    (`.sdlc/PLAN.md` D2).

  `refusals()` and `isDeprecation()` are exported to tell the two kinds of line apart; the
  lines that are not deprecations are the ones that block, and the ones `register()` throws
  on. `register(capability)` is unchanged: it takes one capability, not a document, so it
  neither reports nor accepts the document-level deprecation.

- [#332](https://github.com/ofri-peretz/burgee/pull/332) [`3ea38c3`](https://github.com/ofri-peretz/burgee/commit/3ea38c363b9f0cee9f1c1c2dae4037b047e98328) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - New subpath **`paratext/link`** — OSC 8 on its own, **2,337 B**, and nothing registered at import.

  The root is 17,574 B and runs `registerBuiltins()` as an import-time side effect, which is correct for a program that wants all seven capabilities and unaffordable for one that wants a clickable URL in its `--help`. `burgee` is that consumer: `help.ts` is imported _statically_ by `execute.ts`, so anything help reaches is paid for by `burgee foo --json` as much as by `burgee --help`, and a dynamic `import('paratext')` of a barrel is not shakeable — burgee has a measured 54,986 B failure from exactly that. So the dependency was refused, and the refusal was correct. This entry is the answer to it.

  ```js
  import { link, linkFor, supportsLink } from "paratext/link";

  link("Docs", "https://x.dev");
  // a supporting terminal: ESC ] 8 ; ; https://x.dev BEL Docs ESC ] 8 ; ; BEL
  // a pipe:                Docs (https://x.dev)
  ```

  `linkFor(runtime)` is the form a host should use — `burgee`'s renderer already carries a `Runtime`, and passing it means nothing in the path reads `process`. `supportsLink(runtime)` answers the guess without emitting, for a renderer deciding layout rather than bytes. `LINK` is the capability record itself, and it is the _same object_ `builtins.link` is rather than a copy: the record moved into this module and `builtins.ts` re-exports it.

  **It does not consult the registry, on purpose.** A caller who corrected our terminal guess by re-registering `link` globally does not change what this returns — the registry is what this entry deliberately does not load. `emit(runtime, 'link', …)` on the root is the form that does.

  `Support` and `supports()` moved to an internal `supports.ts` so the subpath can ask "does this terminal do OSC 8" without pulling `schema.json`, which is 6,531 B of plugin contract. Both are re-exported from their old home unchanged; no import moved.

  Also new: **`packages/paratext/src/weight.test.ts`**, the per-entry-point lock `closeout`, `caique` and `roundel` already carry. Every published entry declares what it may reach, what it may never reach, and what it may weigh, and a new export cannot ship without a rule — `./link` may not reach `capability.js`, `builtins.js`, `index.js`, `plugin.js` or `schema.json`, which is what makes "registers nothing" true by construction rather than by inspection.

  Splitting the two modules out cost the root 619 B, 16,955 → 17,574.

- [#334](https://github.com/ofri-peretz/burgee/pull/334) [`0f00f72`](https://github.com/ofri-peretz/burgee/commit/0f00f7273ab0ca111c5869e2b08eb79314df7f70) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `check()` and `register()` now read `schema.json` rather than one array out of it.

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

  What is _not_ enforced is written down rather than left to be discovered: `$ref`, `pattern`,
  `minItems`, `maxLength`, `enum`, `allOf`, `anyOf` and `not`. None appears under a capability
  today, so nothing is silently unchecked — but a keyword added to the schema tomorrow would
  be, and the README says so instead of claiming the whole file is validated.

### Patch Changes

- [#303](https://github.com/ofri-peretz/burgee/pull/303) [`fc640dd`](https://github.com/ofri-peretz/burgee/commit/fc640ddec11255c12d1e0948c5b8e99cc3f3263b) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Stop claiming a drop-in path in the npm description until one is graded.

  The compat oracle now vendors `ansi-escapes`' own suite at 7.3.0 and grades it. The control
  is 4 / 4; `paratext` scores **0 / 4**, and the reason is one line of TAP —
  `SyntaxError: The requested module 'paratext' does not provide an export named 'default'`.
  The ansi-escapes-compatible default export (design R8) is not built, so "Drop-in paths for
  ansi-escapes, terminal-link and term-img" was a claim with a measured zero behind it. The
  description now says what is true — the OSC half of those three packages is covered — and
  defers the drop-in claim to the row that would prove it.

  No runtime behaviour changes.

- [#339](https://github.com/ofri-peretz/burgee/pull/339) [`f295630`](https://github.com/ofri-peretz/burgee/commit/f2956301d5f9dcbcac0b001b00ebaf0315891fac) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `schema.json` constrains token names, because it was promising something no host honours.

  `tokens` was described as any name to a `#rrggbb` colour. `roundel`'s `validate()` accepts
  ten semantic names — `error`, `warn`, `ok`, `hint`, `muted`, `command`, `flag`, `value`,
  `heading`, `ground` — and throws on everything else. So a plugin author doing exactly what
  their own `E_PLUGIN_SCHEMA` error tells them, comparing their object against
  `roundel/schema.json`, got a green from the schema and `"accent" is not a token` from
  `register()`. Measured 2026-09-16 with `{ accent: '[#336699](https://github.com/ofri-peretz/burgee/issues/336699)' }`.

  The schema now carries `propertyNames.enum`, and `scripts/plugin-contract-lock.test.ts`
  pins the enum and the runtime set to each other from both sides, so neither can grow a
  name the other does not know.

  Every host ships a byte-identical copy of this file (`plugin-schema-lock.test.ts` asserts
  it), which is why nine packages are listed. Only the key `roundel` owns is constrained:
  describing `widgets`, `handlers`, `sources`, `resolvers` or `commands` in a file all eight
  hosts share is what made _flagstaff_ start validating caique's key last time
  (`PluginError: plugin.widgets.later: expected object, got boolean`), and those stay in
  `plugin-schema-lock`'s `UNDESCRIBED` list with that reason.

  `linegauge` is in the list for a different change: `ceilings.json`'s R9 block now records
  the bar as D1's tree-inclusive ceiling — 83,538 against 170,342, a ratio of 0.4904 — and
  keeps the superseded `get-east-asian-width` bar beside it with the count of entries that
  cleared it.

## 0.2.0

### Minor Changes

- [#229](https://github.com/ofri-peretz/burgee/pull/229) [`6a6442e`](https://github.com/ofri-peretz/burgee/commit/6a6442e9d2cfc001bc3e05d68dab99aa2c9f451e) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The OSC layer, with extensibility as its shape rather than an addition to it.

  Seven capabilities — `link` (OSC 8), `image` (OSC 1337), `title` (OSC 0), `clipboard`
  (OSC 52), `notify` (OSC 9), `cwd` (OSC 50 + 9;9) and `bell` — and **a capability is one plain
  object with no functions in it**: a name, an OSC code, a declaration of when a terminal is
  believed to understand it, and two templates. It can be written in a config file, generated,
  diffed and validated against the published `paratext/schema.json` without running anybody's
  code, which is what PRINCIPLES rule 7 asks for and what an agent needs to ship one in a turn.

  Nothing in this layer is detectable, so every capability carries a static projection and
  `register` refuses one without it: an image becomes its caption, a notification a printed
  line, a hyperlink `text (url)`, and a pipe receives no control byte at all.

### Patch Changes

- [#229](https://github.com/ofri-peretz/burgee/pull/229) [`6a6442e`](https://github.com/ofri-peretz/burgee/commit/6a6442e9d2cfc001bc3e05d68dab99aa2c9f451e) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Name reserved for the OSC layer. `paratext` will own the escape class that addresses the
  terminal _program_ rather than the character grid — hyperlinks, inline images, the window
  title, the clipboard, desktop notifications, the working directory and the bell — each with
  a static fallback for terminals that cannot do it. Exports only its own name until its intent
  and design are approved.
