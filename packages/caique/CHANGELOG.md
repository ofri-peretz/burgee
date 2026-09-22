# caique

## 0.4.0

### Minor Changes

- [#421](https://github.com/ofri-peretz/burgee/pull/421) [`db3c59e`](https://github.com/ofri-peretz/burgee/commit/db3c59e3dcd373c7e6e4a057715adb173766523f) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Every plugin host has a `check` command.

  ```bash
  npx linegauge check ./my-widths.mjs
  npx burgee check ./my-plugin.mjs --json
  ```

  PRINCIPLES 7 asks three things of an extension surface: the plugin is data validated against one
  published schema, there is a **`check` command that shows it every way it can be seen**, and the
  bar is measured. The first was built in all nine hosts; the second existed in `flagstaff` alone.
  So an author writing a plugin for any other host found out what it did by shipping it into a
  program — and a surface nobody can check is a surface nobody outside this repository can write
  against.

  Each command validates, registers, and shows what the host does with the plugin, in the host's own
  terms: linegauge measures each code point **before and after** the override, paratext shows a
  capability's `encode` **and** its `fallback`, roundel each token and what it replaced, caique each
  widget's static projection rendered with its own sample. burgee's returns a **document** rather
  than printing one, so `burgee check --json` is the form an agent that just wrote a plugin reads.

  They share one contract with the author, held identically across all nine:

  - a readable report, contribution by contribution, with **`ok` as the last line**;
  - a refusal with a code from the family's vocabulary and a `fix`, exit 1;
  - **`E_NO_CONTRIBUTION`** for a plugin that contributes nothing to this host — the schema allows
    unknown keys so one object registers everywhere, which makes a misspelled key silent, and this
    is how that typo tells on itself;
  - exit 2 with no file.

  Each host also gains an eval case measuring the one-turn claim, proved to discriminate before it
  was committed: green against a correct plugin, red against the same plugin with one field broken.

### Patch Changes

- [#430](https://github.com/ofri-peretz/burgee/pull/430) [`4d1b2b3`](https://github.com/ofri-peretz/burgee/commit/4d1b2b399cff354864d1e2e843a19fde80ef1f30) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `check` now reports every refusal with its code and its fix, wherever it was raised.

  Some plugin files register themselves on import: they call `register()` at the top of the module and export the result. Until now, when such a file was refused, the error was thrown inside `check`'s `import()`, before the only `try` that turns a `PluginError` into `E_PLUGIN_SCHEMA: …` plus a `fix:` line. The author got the bare message on stderr, with no code and no fix. Now the whole of `check` runs inside that one handler, so every refusal comes out the same way on every host.

- Updated dependencies [[`4d1b2b3`](https://github.com/ofri-peretz/burgee/commit/4d1b2b399cff354864d1e2e843a19fde80ef1f30), [`db3c59e`](https://github.com/ofri-peretz/burgee/commit/db3c59e3dcd373c7e6e4a057715adb173766523f), [`db3c59e`](https://github.com/ofri-peretz/burgee/commit/db3c59e3dcd373c7e6e4a057715adb173766523f)]:
  - closeout@0.3.0
  - linegauge@0.4.0

## 0.3.1

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

## 0.3.0

### Minor Changes

- [#381](https://github.com/ofri-peretz/burgee/pull/381) [`8104eb9`](https://github.com/ofri-peretz/burgee/commit/8104eb9fa9bfdcb58ad9df4e9e9b1e42f7b86907) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `caique/inquirer` and `caique/clack` — two drop-in subpaths, and the first measured numbers
  either incumbent has given caique.

  `caique/inquirer` is `@inquirer/core`'s surface over `node:readline` and `node:async_hooks`:
  `createPrompt`, `useState`, `useEffect`, `useMemo`, `useRef`, `useKeypress`, `usePrefix`,
  `makeTheme`, `Separator`, the eight key predicates and the five error classes. Graded
  **41 / 41, 100.0%** against `@inquirer/core` 12.0.3's own suite, up from 0 / 41 — a suite
  that renders through a headless xterm and asserts the screen, so what passed is the prompt
  loop rather than a drawing. `usePagination` is not implemented and is named as a gap in
  `.sdlc/intents/caique/design.md` rather than shipped ungraded.

  `caique/clack` is `limitOptions`, which is the part of `@clack/prompts` that is a rule
  rather than a drawing. Graded **14 / 17, 82.4%**, up from 0 / 606 — and the denominator
  moved for a reason published in full on the compatibility page: 289 of that suite's 444
  assertions are `toMatchSnapshot()` across 17 of its 19 files, and those seventeen are
  subtracted as a declared subset, one named entry each. The three that remain unpassed are
  all of `guide.test.ts` and are a ceiling, not a shortfall: two want clack's twelve prompts
  drawn frame for frame, and the third asserts we read `updateSettings` out of `@clack/core`'s
  own module state, which a package with no external dependencies cannot see.

  Both subpaths reach `linegauge/wrap`, and `caique/inquirer` also reaches
  `closeout/exit-hook` — both published from this repository, both declared, both budgeted in
  `weight.test.ts`. The package root is unchanged: nothing in either façade is reachable from
  `caique` itself.

### Patch Changes

- [#373](https://github.com/ofri-peretz/burgee/pull/373) [`a1f1d40`](https://github.com/ofri-peretz/burgee/commit/a1f1d40b7d1e7244f3a180943b641bb3b491d256) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Stage 2's artifact is now `spec.md`, the name Anthropic's AI-Native SDLC playbook gives it, so the source comments and README sections that cite a package's own design document point at `spec.md` rather than `design.md`.

  No behaviour changes. The published tarballs do move, by two bytes per surviving reference — `design.md` is nine characters and `spec.md` is seven — so the four packages carrying a weight band were re-measured against it: linegauge 83,538 to 83,536; paratext 66,343 to 66,341; closeout 84,455 to 84,453; bellpull 86,113 to 86,107.

- Updated dependencies [[`a1f1d40`](https://github.com/ofri-peretz/burgee/commit/a1f1d40b7d1e7244f3a180943b641bb3b491d256)]:
  - closeout@0.2.1
  - linegauge@0.3.1

## 0.2.0

### Minor Changes

- [#294](https://github.com/ofri-peretz/burgee/pull/294) [`3f92a60`](https://github.com/ofri-peretz/burgee/commit/3f92a6099b1b8d5d476c64405ca963d40bf9af45) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `caique/plugin` — a plugin may now ship a prompt kind caique does not have. `register({ widgets })` keeps the `widgets` key and ignores every other layer's, so the same plugin object works on any subset of the family that is installed (`plugin-contract` R1, R5). A widget is the same shape a flagstaff component is — `{ static, frame?, sample? }` — and one without `static` is refused with `E_NO_STATIC_PROJECTION`, the same code and the same fix shape.

  `PromptKind` is an open union (`… | (string & {})`). It was closed, which made a plugin's seventh kind a type error and would have turned hosting `widgets` into a breaking change written as an additive one; the six literals stay in an editor's completion list, which a bare `string` would have thrown away.

  Because the union is open, a kind nobody registered no longer falls through to a text prompt — `projectionOf()` refuses it with `E_UNKNOWN_KIND`, and the message names the kinds that _are_ registered so the reader sees the typo rather than a text prompt where their widget should have been. The six built-ins are still drawn by caique and a plugin may not replace them: `password` guarantees that nothing writes back what it read, and a third party able to override it could defeat that from a config file.

  Also ships `caique/schema.json`, byte-identical to flagstaff's and roundel's (R2) — the specifier caique's own `E_PLUGIN_SCHEMA` fix names, so following the advice resolves.

### Patch Changes

- [#326](https://github.com/ofri-peretz/burgee/pull/326) [`88f7ba6`](https://github.com/ofri-peretz/burgee/commit/88f7ba65e3a79ed20bf7c5bc4feae8b87684122b) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - A `Runtime` seam on caique (PLAN 4.3, Y9).

  `src/runtime.ts` declares the slice of the world caique reads — `env`, `stdin`, `stdout` and
  the two `isTTY` flags — and `processRuntime()`, the one function in the package that names
  `process`. It is a function and not a constant, for the reason paratext's is: a runtime built
  at import freezes the environment as it was when the module graph loaded, which is before a
  test can say what it wants the world to look like.

  `createIo()` now takes no argument and builds over the real process, so a program gets the
  terminal it was started in without naming `process` itself; `streamsOf(runtime)` is the
  mapping for callers that already hold one. `decide()` is unchanged and still takes the
  narrower pair it reads, which is what the root export's `Runtime` continues to name.

  `runtime.test.ts` asserts the seam rather than documenting it: `runtime.ts` is the only
  non-test source in the package that reads the process, and `processRuntime()` returns two
  different answers across a change to the environment made after the import.

- [#332](https://github.com/ofri-peretz/burgee/pull/332) [`3ea38c3`](https://github.com/ofri-peretz/burgee/commit/3ea38c363b9f0cee9f1c1c2dae4037b047e98328) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Restore the cursor when a prompt is killed, by taking the job from `closeout`.

  `raw.ts` hid the cursor and put it back on one path: the keypress loop, which sees Ctrl-C
  because raw mode delivers it as a byte rather than a signal. A `SIGINT` from a parent
  process, a `SIGTERM`, a crash or a `process.exit()` elsewhere in the program never reached
  that loop, and left the cursor invisible in the user's shell until they typed `reset`.
  Measured against the built `dist/raw.js`: hide 1, show 0, for `SIGINT`, `SIGTERM` and
  `SIGHUP` alike.

  `askList()` now hides through `closeout.hideCursor()`, which registers the restore in the
  same call, with `closeout/exit-hook` running it on the paths a keypress loop cannot see.
  The two escape sequences come from `closeout/cursor` as well, so caique no longer carries
  the family's third copy of them. The bytes on the wire are unchanged for a prompt that
  ends normally, and a prompt that ended unregisters, so exit writes nothing twice.

  caique therefore installs one package, `closeout`, which this repository publishes and
  which sits in the foundation tier below it. Nothing outside this repository is installed.

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

- Updated dependencies [[`c8acb28`](https://github.com/ofri-peretz/burgee/commit/c8acb2848714a1cbe3e26a2f9895d7498fb4f096), [`fc640dd`](https://github.com/ofri-peretz/burgee/commit/fc640ddec11255c12d1e0948c5b8e99cc3f3263b), [`3f92a60`](https://github.com/ofri-peretz/burgee/commit/3f92a6099b1b8d5d476c64405ca963d40bf9af45), [`3ea38c3`](https://github.com/ofri-peretz/burgee/commit/3ea38c363b9f0cee9f1c1c2dae4037b047e98328), [`f295630`](https://github.com/ofri-peretz/burgee/commit/f2956301d5f9dcbcac0b001b00ebaf0315891fac)]:
  - closeout@0.2.0

## 0.1.1

### Patch Changes

- [#92](https://github.com/ofri-peretz/burgee/pull/92) [`24e025d`](https://github.com/ofri-peretz/burgee/commit/24e025d267ee078bf02af9706faa7574b0679942) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Lock caique's weight, per subpath, against clack.

  caique was the last published package in the family without a `weight.test.ts` — so the one
  package that talks to a person, and to an agent, was the one making an unmeasured claim.

  **The whole package is 25,627 B and reaches no package at all, against `@clack/prompts`
  1.8.0's 101,684 B across six.** Deciding _not_ to ask — the case an agent hits — costs
  4,986 B and never loads the machinery of asking.

  Every entry now declares what it may import (nothing), what it may weigh, and what it must
  never reach; and an entry cannot be added without a budget.

## 0.1.0

### Minor Changes

- [#71](https://github.com/ofri-peretz/burgee/pull/71) [`e204772`](https://github.com/ofri-peretz/burgee/commit/e204772ce0647b3158994e57dc48828163f47488) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Add `caique/raw`: arrow-key `select` and `multiselect` on a terminal that can take raw mode.

  `askList()` draws a moving highlight and repaints in place, and answers the same question
  `ask()` does with the same value — line mode stays the floor, this is decoration on top,
  and the suite proves the two agree by running one spec through both. `keyOf()` reads a
  keypress, `canRender()` says whether a runtime can take raw mode, and `renderList()` is one
  frame so the drawing is asserted rather than screenshotted.

  `Ctrl-C` cancels — in raw mode it arrives as a byte, not a signal — and the terminal is
  restored (raw mode off, cursor shown) whatever the answer.

  No dependency on flagstaff: a prompt has no spinner, and the repaint it needs is three
  escape sequences.

### Patch Changes

- [#66](https://github.com/ofri-peretz/burgee/pull/66) [`b43e1d3`](https://github.com/ofri-peretz/burgee/commit/b43e1d3ccd62aad40b295cf4151aaff526d24acb) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `ask()` — the six prompt kinds in line mode, which is also the accessible rendering rather than a second implementation of it. A stream that ends is a cancellation, not an empty answer; invalid input is re-asked a bounded five times, never forever; `projection(spec)` gives the question without the conversation.

- [#66](https://github.com/ofri-peretz/burgee/pull/66) [`b43e1d3`](https://github.com/ofri-peretz/burgee/commit/b43e1d3ccd62aad40b295cf4151aaff526d24acb) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `resolvePrompts()` — the pass a framework calls from its `preAction` hook: walks a command's options in declaration order, asks only what has to be asked, and stops at the first refusal. One host-agnostic binding rather than one per host, so nothing in caique imports burgee.

- [#66](https://github.com/ofri-peretz/burgee/pull/66) [`b43e1d3`](https://github.com/ofri-peretz/burgee/commit/b43e1d3ccd62aad40b295cf4151aaff526d24acb) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `decide()` — the pure rule that decides whether a person can be asked at all: a value from any source wins, `--json` never prompts, `--yes` answers a confirm and only a confirm, and no terminal means an error naming the flag rather than a wait. All 256 combinations the design names are enumerated in the suite, not sampled.

- [#69](https://github.com/ofri-peretz/burgee/pull/69) [`2da5883`](https://github.com/ofri-peretz/burgee/commit/2da5883d512705c370c2da1eb07efdfcfc869c29) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `createIo()` — a reader and writer over real streams, so `ask()` can be used by a program and not only by a test. A `password` prompt is not echoed, and the muting lives in the one layer that knows what echo is.
