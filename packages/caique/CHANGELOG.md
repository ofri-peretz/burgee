# caique

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
