# caique

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
