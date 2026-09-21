# flagstaff

## 0.3.3

### Patch Changes

- [#404](https://github.com/ofri-peretz/burgee/pull/404) [`c70ff9c`](https://github.com/ofri-peretz/burgee/commit/c70ff9c6bf00ec4aff9b8a735f4246dd3193fb1a) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `flagstaff/cli-table3`'s `Cell` carries `ColSpanCell` and `RowSpanCell`, the way cli-table3's
  own `src/cell.js` publishes them — `module.exports = Cell; module.exports.ColSpanCell = …;
module.exports.RowSpanCell = …`. A caller who reaches `Cell.RowSpanCell` on the incumbent now
  reaches it here. Both names were already named exports of the module; this is a second
  spelling of the incumbent's shape, and nothing new is published.

  With it, cli-table3's internal suite reads **103 / 104** against a control of 103 / 104 — the
  target matches the reference exactly, up from 90.

## 0.3.2

### Patch Changes

- [#398](https://github.com/ofri-peretz/burgee/pull/398) [`ee35904`](https://github.com/ofri-peretz/burgee/commit/ee35904e987a0133f2c0b51371227f840e0fd677) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - A `__proto__` key in a caller's corpus stays a style.

  `fromCliSpinners` and `fromCliBoxes` built their maps by assigning `map[key] = value` over
  the caller's JSON. JSON can carry the key `__proto__`, and that assignment hands it to the
  prototype setter rather than defining a property: the entry vanished from the plugin _and_
  whatever it held became the fallback that every other `lookupSpinner` and `lookupBorder`
  inherited. Both now build with `Object.fromEntries`, which defines an own property for
  every key, and the returned map keeps `Object.prototype`.

  The registry's `deepFrozen` copy and caique's prompt binding write the same shape from a
  loop they cannot turn into an expression, and use `Object.defineProperty` instead.

  `flagstaff/import` is 80 bytes lighter for it — 838 B to 758 B — because two loops became
  two expressions.

## 0.3.1

### Patch Changes

- [#375](https://github.com/ofri-peretz/burgee/pull/375) [`98ac9a3`](https://github.com/ofri-peretz/burgee/commit/98ac9a38adce19bd8067d47b72573bb5fe0a3637) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `flagstaff/cli-table3` — cli-table3's internal surface now hangs off the default export, and
  the informational internals column moves **0 / 104 to 90 / 104** against a control of 103 / 104.

  No behaviour changed and the gated row is 29 / 29 before and after. All 104 internal cases
  were failing as `X is not a function`: the compat oracle reaches a target's internals through
  a CommonJS shim whose body is `module.exports = loaded?.default ?? loaded`, and that unwrap
  hands the suite the `Table` class rather than the namespace where `Cell`, `strlen`,
  `computeWidths` and fifteen more already lived. `Object.assign(Table, { … })` at the foot of
  the module publishes them the way cli-table3's own `src/cell.js` publishes `ColSpanCell` and
  `RowSpanCell` — a second spelling of names this subpath already exported, plus six that were
  private only because nothing had asked.

  Two ceilings are recorded with the measurement in `compat-oracle/src/hosts.ts` rather than
  chased: 13 cases in `table-layout-test.js` that resolve `Cell` to `Table` because the shim
  collapses four internal modules onto one entry, and the 94 cases of `cell-test.js`, which
  never register in the control run either.

  `./cli-table3`'s byte ratchet rises 29,000 to 29,300 for the 240 B this costs, with the
  reasoning in `weight.test.ts`. It is a ceiling moving in the loosening direction and is the
  owner's to reverse.

- [#373](https://github.com/ofri-peretz/burgee/pull/373) [`a1f1d40`](https://github.com/ofri-peretz/burgee/commit/a1f1d40b7d1e7244f3a180943b641bb3b491d256) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Stage 2's artifact is now `spec.md`, the name Anthropic's AI-Native SDLC playbook gives it, so the source comments and README sections that cite a package's own design document point at `spec.md` rather than `design.md`.

  No behaviour changes. The published tarballs do move, by two bytes per surviving reference — `design.md` is nine characters and `spec.md` is seven — so the four packages carrying a weight band were re-measured against it: linegauge 83,538 to 83,536; paratext 66,343 to 66,341; closeout 84,455 to 84,453; bellpull 86,113 to 86,107.

- Updated dependencies [[`f3224f4`](https://github.com/ofri-peretz/burgee/commit/f3224f4f43da21bbeeac931c2ec8afc50f0c3235), [`2f6cb16`](https://github.com/ofri-peretz/burgee/commit/2f6cb160f488668c56d61e3e3f0ed612137295af), [`a1f1d40`](https://github.com/ofri-peretz/burgee/commit/a1f1d40b7d1e7244f3a180943b641bb3b491d256)]:
  - paratext@0.4.0
  - closeout@0.2.1
  - linegauge@0.3.1

## 0.3.0

### Minor Changes

- [#340](https://github.com/ofri-peretz/burgee/pull/340) [`c123029`](https://github.com/ofri-peretz/burgee/commit/c12302982e13432d7145399def4c790890546cc3) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `flagstaff/box` and `flagstaff/table` render a path or a url as a terminal hyperlink, and `flagstaff` is the first package in the family to build on `paratext` (paratext R12).

  A table cell may be `{ text, href }` and a box may be given `{ href }`. On a terminal believed to understand OSC 8 the text becomes a real hyperlink; on a pipe, in a log, under `TERM=dumb`, and for a screen reader it reads `src/index.ts (file:///repo/src/index.ts)` — the destination survives rather than being dropped with the escape, and no control byte reaches a file. Neither the guess nor the sequence is flagstaff's: both come from `paratext/link`, and `flagstaff` passes it a runtime instead of re-deciding.

  `flagstaff/cli-table3`'s `hyperlink()` now builds its sequence the same way. It still emits unconditionally and byte for byte what upstream emits — that is the drop-in contract, and cli-table3 still grades 29 / 29 — but the escape itself is no longer written out a second time in this package. `src/link.test.ts` locks that: no published file here spells an OSC 8 sequence of its own.

  `paratext/link` rather than `paratext`: 2,410 B and no registry against 20,221 B and `registerBuiltins()` at import, measured in paratext's own `dist/`. `flagstaff/table` grew 1,675 B and `flagstaff/box` 1,502 B; the two budgets in `weight.test.ts` moved with them and the reasoning is recorded there.

### Patch Changes

- [#332](https://github.com/ofri-peretz/burgee/pull/332) [`3ea38c3`](https://github.com/ofri-peretz/burgee/commit/3ea38c363b9f0cee9f1c1c2dae4037b047e98328) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `flagstaff` no longer carries its own copy of "put the cursor back however the process dies". `src/cursor.ts` is deleted and its three consumers — the `ora` façade, the `log-update` façade and the loop's `tty` projection — reach `closeout` instead, which owns `restore-cursor` and `signal-exit` and grades 6 / 6 against `restore-cursor`'s own suite. That module's own header argued there is exactly one correct implementation of this and that a second copy is a second place to get it wrong; it was the second copy. There was a third, in `caique`.

  The two façades use `closeout/restore-cursor`, whose contract is the one their incumbents grade: the stream is a property of the _process_ — stderr if it is a terminal, else stdout — decided when you call, and written at exit whatever `isTTY` says by then. The projection uses `closeout`'s `onExit` in the `restore` phase, because it draws on the stream the Runtime handed it and must not learn that `process` exists. `closeout/exit-hook` is deliberately **not** used: it is faithful to its own incumbent, which never registers SIGHUP, so a closing terminal would not have reached the restore.

  **A defect went with it.** The deleted module held a process-wide `cursorRestoreInstalled` flag — first caller installs the net, every later caller gets a no-op. That reads like a guard against a duplicate restore. It was a lost one: the second surface's writer was never registered, so a program with a hoisted frame on stdout and a spinner on stderr hid two cursors and put back one, leaving stderr's hidden. Measured on the previous build at `stderr { hide: 1, show: 0 }`. Registering per caller fixes it, and `src/cursor-net.test.ts` grades both halves — every hidden stream restored, and the one redundant (idempotent) show that two surfaces on a single stream now write.

  No compatibility row moves: ora 99 / 99, log-update 99 / 99, boxen 84 / 84. None of those suites kills the process, which is why the guarantee is graded by flagstaff's own signal cases against the built `dist/` in a child that is really signalled.

  `flagstaff` now depends on `closeout`. The per-entry weight measurements fall — `.` −1,666 B, `./loop` −1,666 B, `./ora` −1,591 B, `./log-update` −1,591 B — and **nothing got lighter**: the walk stops at a bare specifier, so the code left the measurement while staying in the program. Installed bytes go up, not down.

- [#326](https://github.com/ofri-peretz/burgee/pull/326) [`88f7ba6`](https://github.com/ofri-peretz/burgee/commit/88f7ba65e3a79ed20bf7c5bc4feae8b87684122b) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - One `Runtime` seam per package, and one file in each that names the process (Y9).

  `roundel/src/runtime.ts` and `flagstaff/src/runtime.ts` each declare a `Runtime` — the slice
  of the world that package actually needs — and a `processRuntime()` that is the only place
  the real process is named. Six files stop naming it: `roundel/chalk`, and flagstaff's `cli`,
  `ora`, `boxen`, `cursor` and `log-update`.

  Nothing about the ports' behaviour moved, and the shape of each seam is what holds that.
  roundel's returns a literal, because chalk's contract is to detect the terminal once at
  import; flagstaff's hands back the live process narrowed to the interface, because its
  incumbents read the process at call time — boxen takes `stdout.columns` every time a box is
  drawn, so a box drawn after a resize still uses the new width, and ora still hooks the real
  stream objects and still looks up `kill` when it re-signals a swallowed Ctrl+C. The
  compatibility rows are unchanged: chalk 58/58, ora 99/99, log-update 99/99, boxen 84/84,
  restore-cursor 6/6.

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

- Updated dependencies [[`c8acb28`](https://github.com/ofri-peretz/burgee/commit/c8acb2848714a1cbe3e26a2f9895d7498fb4f096), [`fc640dd`](https://github.com/ofri-peretz/burgee/commit/fc640ddec11255c12d1e0948c5b8e99cc3f3263b), [`3f92a60`](https://github.com/ofri-peretz/burgee/commit/3f92a6099b1b8d5d476c64405ca963d40bf9af45), [`3ea38c3`](https://github.com/ofri-peretz/burgee/commit/3ea38c363b9f0cee9f1c1c2dae4037b047e98328), [`fc640dd`](https://github.com/ofri-peretz/burgee/commit/fc640ddec11255c12d1e0948c5b8e99cc3f3263b), [`3ea38c3`](https://github.com/ofri-peretz/burgee/commit/3ea38c363b9f0cee9f1c1c2dae4037b047e98328), [`c8acb28`](https://github.com/ofri-peretz/burgee/commit/c8acb2848714a1cbe3e26a2f9895d7498fb4f096), [`88f7ba6`](https://github.com/ofri-peretz/burgee/commit/88f7ba65e3a79ed20bf7c5bc4feae8b87684122b), [`c8acb28`](https://github.com/ofri-peretz/burgee/commit/c8acb2848714a1cbe3e26a2f9895d7498fb4f096), [`3f92a60`](https://github.com/ofri-peretz/burgee/commit/3f92a6099b1b8d5d476c64405ca963d40bf9af45), [`fc640dd`](https://github.com/ofri-peretz/burgee/commit/fc640ddec11255c12d1e0948c5b8e99cc3f3263b), [`3ea38c3`](https://github.com/ofri-peretz/burgee/commit/3ea38c363b9f0cee9f1c1c2dae4037b047e98328), [`0f00f72`](https://github.com/ofri-peretz/burgee/commit/0f00f7273ab0ca111c5869e2b08eb79314df7f70), [`f295630`](https://github.com/ofri-peretz/burgee/commit/f2956301d5f9dcbcac0b001b00ebaf0315891fac)]:
  - closeout@0.2.0
  - linegauge@0.3.0
  - roundel@0.3.1
  - paratext@0.3.0

## 0.2.1

### Patch Changes

- Updated dependencies [[`214f6f8`](https://github.com/ofri-peretz/burgee/commit/214f6f83b16068d7dc53d79799fba03c26a3cbe2), [`214f6f8`](https://github.com/ofri-peretz/burgee/commit/214f6f83b16068d7dc53d79799fba03c26a3cbe2), [`ecedfa2`](https://github.com/ofri-peretz/burgee/commit/ecedfa2ed0c7aaed23d77c4d02d7c94156a78ce9), [`ea58e63`](https://github.com/ofri-peretz/burgee/commit/ea58e637ee0ee6cdcc655478f6bef54d854f6c0f), [`3d744d9`](https://github.com/ofri-peretz/burgee/commit/3d744d99d92cdc7fc675ad105e4e4b9c6eebca5f), [`59d910c`](https://github.com/ofri-peretz/burgee/commit/59d910c1da7bca519bd1c2d5ca43b6c57e260621), [`93114d3`](https://github.com/ofri-peretz/burgee/commit/93114d33b5ac3f9a0ab3b48506255897af40133b)]:
  - roundel@0.3.0
  - linegauge@0.2.0

## 0.2.0

### Minor Changes

- [#86](https://github.com/ofri-peretz/burgee/pull/86) [`e927678`](https://github.com/ofri-peretz/burgee/commit/e927678f4590e29765d9db947f6141eb12aa34d8) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Add `flagstaff/boxen`: boxen 8's API, graded **84 / 84 by boxen's own test suite**.

  Every one of boxen's 84 cases is a snapshot of the exact characters the box comes out as, so
  matching the drawing byte for byte _is_ the compatibility claim rather than a way of
  avoiding one — a user leaving boxen cares about one thing, whether the box still looks the
  same.

  `borderStyle` (all eight cli-boxes styles, a style object, or `none`), `borderColor`,
  `backgroundColor`, `dimBorder`, `title`/`titleAlignment`, `textAlignment`, `padding`,
  `margin`, `width`, `height`, `float`, `fullscreen`, and the `_borderStyles` re-export.

  Eight dependencies folded in. boxen reaches `string-width`, `wrap-ansi`, `cli-boxes`,
  `ansi-align`, `widest-line`, `camelcase`, `chalk` and `type-fest`; this reaches `width.js`
  and `wrap.js` — both already shipped for `flagstaff/ora` and `flagstaff/log-update` — plus
  `roundel/chalk`. **43.0 KB in two packages, against boxen 8.0.1's 151.4 KB in fourteen.**

  It carries cli-boxes' table itself rather than reading the plugin registry: `_borderStyles`
  is boxen's public surface, and a façade whose drawing changed when somebody registered a
  plugin would be reinterpreting its host. Named borders through the registry stay
  `flagstaff/box`'s job.

- [#116](https://github.com/ofri-peretz/burgee/pull/116) [`3daa412`](https://github.com/ofri-peretz/burgee/commit/3daa4126eba162ff036caeac26c5568ca2096b47) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Add `flagstaff/cli-table3`: cli-table3 0.6.5's API, graded **29 / 29 by cli-table3's own
  test suite**.

  The full option surface — `head`, `chars`, `style`, `colWidths`, `rowHeights`, `colAligns`,
  `rowAligns`, `truncate`, `wordWrap`, `wrapOnWordBoundary`, per-cell `colSpan`, `rowSpan`,
  `hAlign`, `vAlign`, `href`, and the `debug` channel with `table.messages` and
  `Table.reset()`. It extends `Array`, because cli-table3 does and its callers push rows onto
  it.

  **One module, not four.** Upstream is `table.js`, `layout-manager.js`, `cell.js` and
  `utils.js`, and 201 of its 234 cases test those files directly. Those are reported beside
  the number and never gate it — passing them would mean copying cli-table3's file layout
  rather than matching its behaviour, which is the one thing a façade owes its users.

  **42.3 KB in two packages, against cli-table3 0.6.5's 161.7 KB in seven.** It reaches
  `width.js`, already shipped for the other three façades, plus `roundel/chalk` for the two
  default styles. It carries its own wrapping rather than sharing `wrap.js`: cli-table3 splits
  on `/(\s+)/` and counts with its own `strlen`, which a wrap-ansi port does not reproduce.

### Patch Changes

- [#149](https://github.com/ofri-peretz/burgee/pull/149) [`0d2520b`](https://github.com/ofri-peretz/burgee/commit/0d2520b04d297880f7117e54757361d0e04018c4) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Correct the published weight comparisons against boxen and cli-table3, both of which overstated the incumbent. boxen 8.0.1 is 132,414 B across nineteen packages, not the 151,351 in fourteen the README and weight rules claimed; cli-table3 0.6.5 is 105,983 across seven, not 161,690. ora and log-update reproduce to the byte and are unchanged.

- [#82](https://github.com/ofri-peretz/burgee/pull/82) [`61bd11b`](https://github.com/ofri-peretz/burgee/commit/61bd11b9a1bf1fe73dd5a6e76e0898614e988ec7) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - One door into the registry, and a `check` that grades what it actually found.

  `registered()` handed out the live registry behind a `Readonly<Registry>` type that freezes
  property bindings, not the `Map`s behind them — so `registered().spinners.set(…)` put a
  spinner with no static projection where `spinner()` would find it, and `.clear()` removed
  the built-ins. It now returns a copy over the frozen objects `register()` stores, which
  makes U3's "a contribution without a static projection is refused at the door" a property of
  the code rather than advice. Registering also copies: edit your plugin object afterwards and
  the registry does not change.

  `flagstaff check` opens with a census of the contributions it found and closes with the
  verdict, so `ok` is never printed before the rendering that would justify it. A plugin whose
  keys are misspelled — the schema allows unknown keys on purpose, for the rest of the family —
  is now `E_NO_CONTRIBUTION` and exit 1 with the unknown keys named, rather than `ok` and exit 0. Each component block states the state it was rendered with: a component may declare
  `sample: { running, done }`, and without one the assumed `{ phase }` shape is said out loud
  instead of silently invented. A `static` that throws is `E_COMPONENT_THREW` with a fix and
  the modes it broke in, rather than an uncaught crash after an `ok`.

  roundel is bumped with it because the plugin schema is hosted in both packages and both
  publish it: `packages/roundel/src/schema.json` gained the same `sample` key, and
  `plugin-schema-lock.test.ts` requires the two to be byte-identical. Without a roundel
  release the copies would agree in git and disagree in the registry — the contract's own
  "byte-identical in every tarball" rule holding in the repository and breaking where anyone
  would actually read it. This is the first contract change since roundel became a plugin
  host, so the pairing is worth establishing now rather than after the second one.

  Both of those codes are now members of the exported `PluginErrorCode`, which is the union
  every refusal in the family comes from. They were bare string literals inside `cli.ts`, so a
  second host could have spelled either one its own way and nothing would have noticed — the
  plugin contract's "one error vocabulary" held only as long as nobody tested it. `refuse()`
  takes `PluginErrorCode` rather than `string`, and a repo lock reads each host's declaration
  out of its source and refuses any `E_…` literal that is not in it. The union is a type, so
  this costs no bytes on any subpath.

- [#117](https://github.com/ofri-peretz/burgee/pull/117) [`ec43c47`](https://github.com/ofri-peretz/burgee/commit/ec43c473f7cb609d6690087f1fc369240d56a315) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `register()` lists a plugin name once instead of accumulating it — every other contribution already landed in a `Map`, so re-registering replaced entries while the name list grew, and `flagstaff check` and the docs gallery both project that list.

- [#75](https://github.com/ofri-peretz/burgee/pull/75) [`f2eaa6a`](https://github.com/ofri-peretz/burgee/commit/f2eaa6a7d170e24827a5bbb110ad9968b12d19e9) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `hoist()` puts the cursor back when a signal ends the process. `close()` restored it, and
  `close()` does not run for a signal with no listener — so Ctrl+C during a frame left the
  terminal with no cursor at all. The loop now shares the `cursor.js` both façades use.

- [#182](https://github.com/ofri-peretz/burgee/pull/182) [`28a838f`](https://github.com/ofri-peretz/burgee/commit/28a838f0c1314fb79594d9d8bd8e02de785ea80a) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `linegauge` is real: `width` and `wrap` move out of `flagstaff` into the foundation
  package that was reserved for them (F1, the move only). The default export is `width`,
  call-compatible with `string-width`'s default. `flagstaff` imports them and deletes both
  files; its 227 tests pass unchanged, and B4's bundled bytes are identical to the byte —
  the code went to a different file, not away.
- Updated dependencies [[`61bd11b`](https://github.com/ofri-peretz/burgee/commit/61bd11b9a1bf1fe73dd5a6e76e0898614e988ec7), [`8586f58`](https://github.com/ofri-peretz/burgee/commit/8586f58542e7896675c0b6fa8815278f8d22d4a3), [`28a838f`](https://github.com/ofri-peretz/burgee/commit/28a838f0c1314fb79594d9d8bd8e02de785ea80a), [`7c5eeb0`](https://github.com/ofri-peretz/burgee/commit/7c5eeb0c04a9a692db748ea7f3ccb2f3339fa5a2)]:
  - roundel@0.2.0
  - linegauge@0.1.0

## 0.1.0

### Minor Changes

- [#45](https://github.com/ofri-peretz/burgee/pull/45) [`4e376fe`](https://github.com/ofri-peretz/burgee/commit/4e376fe5381b8b7e94237273ab8f65096c3bb6a1) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The first working release: `hoist()` with a static projection per mode, `register()` over `schema.json`, the `dots` and `line` spinners as a plugin, and `flagstaff check`.

- [#62](https://github.com/ofri-peretz/burgee/pull/62) [`5e34676`](https://github.com/ofri-peretz/burgee/commit/5e3467603b5d1f84f8257f095f1e95f8154fc935) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `flagstaff/ora` — ora 9's whole API, graded 99 / 99 by ora's own test suite. One import changes; the seventeen packages ora ships become two, 113,577 B of JavaScript becomes 55,641 B (49%), and the spinner corpus, the display width, the log symbols, the cursor control — restored on `SIGINT`, `SIGTERM` and `SIGHUP` as well as a clean exit — and the stdin discarder come with it. Both sides counted the same way from the entry point: shipped `.js` plus the `.json` a module imports, `package.json` excluded.

### Patch Changes

- [#66](https://github.com/ofri-peretz/burgee/pull/66) [`b43e1d3`](https://github.com/ofri-peretz/burgee/commit/b43e1d3ccd62aad40b295cf4151aaff526d24acb) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The four remaining built-ins: `progress`, `tasks`, `box` and `table`, each on its own subpath. `box()` and `table()` are also plain string functions for the callers who want the string. Every one answers the static projection separately — a progress bar is `12/30 files · 40%` off a terminal, a table is `header: value` pairs — because a stripped drawing is not information.

- [#68](https://github.com/ofri-peretz/burgee/pull/68) [`8666f70`](https://github.com/ofri-peretz/burgee/commit/8666f70c46bfd09111815ee1e950466bea125ea7) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `flagstaff/log-update` restores the cursor when the process is signalled, not only when it exits normally. It shipped with `process.once('exit', …)` and nothing else — which node does not run when a signal with no listener terminates the process — so Ctrl+C mid-frame left the terminal with no cursor. That is the same defect `flagstaff/ora` fixed before it shipped, so the fix is now one module, `src/cursor.ts`, that both façades import: `signal-exit`'s 22.0 KB in 1.4 KB, with the re-raise and its `listenerCount` guard, so a program that installed its own `SIGINT` handler is still delivered exactly one signal and is never overruled. Graded per façade against the built `dist/` in a child process that is really signalled.

- [#66](https://github.com/ofri-peretz/burgee/pull/66) [`b43e1d3`](https://github.com/ofri-peretz/burgee/commit/b43e1d3ccd62aad40b295cf4151aaff526d24acb) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `flagstaff/import` — `fromCliSpinners()` and `fromCliBoxes()` turn the corpora you already have into ordinary plugins, through the same `register()` and the same schema. Neither corpus is bundled; 838 B, reaching nothing. The plugin contract gains `borders`, and the built-in border styles move into the built-ins plugin with the spinners, so `box()` can draw with a style a plugin registered.

- [#66](https://github.com/ofri-peretz/burgee/pull/66) [`b43e1d3`](https://github.com/ofri-peretz/burgee/commit/b43e1d3ccd62aad40b295cf4151aaff526d24acb) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `flagstaff/log-update` — log-update 8's API, graded 99 / 99 by log-update's own suite, which renders every frame through a real terminal emulator. Sixteen packages and 113.4 KB become **none** and 28.7 KB: the subpath reaches no package at all. Brings `wrap()`, an ANSI-aware wrapper graded differentially against wrap-ansi, which `box` and `table` share.

- [#76](https://github.com/ofri-peretz/burgee/pull/76) [`847f79a`](https://github.com/ofri-peretz/burgee/commit/847f79a02e3fbd82b58a360db91b46bd7ed09c48) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Export `flagstaff/schema.json`.

  `PluginError`'s fix for `E_PLUGIN_SCHEMA` tells a plugin author to "compare the object
  against flagstaff/schema.json", and that specifier did not resolve — following the advice
  got `ERR_PACKAGE_PATH_NOT_EXPORTED`. The file already shipped in the tarball; only the
  `exports` entry was missing.

- [#66](https://github.com/ofri-peretz/burgee/pull/66) [`b43e1d3`](https://github.com/ofri-peretz/burgee/commit/b43e1d3ccd62aad40b295cf4151aaff526d24acb) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The static projection writes only what is new. A component whose projection is a growing list — `tasks`, whose static is every task that has settled — reprinted every line already in the log on each change; it now writes the lines past the common prefix. An empty projection writes nothing at all, rather than a blank line. Found by generating the docs gallery from the components themselves.
- Updated dependencies [[`183ebc9`](https://github.com/ofri-peretz/burgee/commit/183ebc90d38c7a23afda1f923c9b147560458334), [`c65bad8`](https://github.com/ofri-peretz/burgee/commit/c65bad85111fd29a2c5941ea2b3b7d6034dff7ff)]:
  - roundel@0.1.0
