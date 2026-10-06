# controlroom

## 0.3.0

### Minor Changes

- [#839](https://github.com/ofri-peretz/burgee/pull/839) [`7694faa`](https://github.com/ofri-peretz/burgee/commit/7694faa1328fb5db10eeea8ffc7b074ca667f82e) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `controlroom/ink` is ink 8.0.0's API, graded 1304 / 1304 by ink 8's own suite (control 1303 / 1304). New: `usePaste`, `useAnimation`, `useBoxMetrics`, `useWindowSize`, `suspendTerminal` and `waitUntilRenderFlush` on `useApp`, the `alternateScreen` and `interactive` options, `wrap="hard"`, and the yoga props ink 8 sets — `maxWidth`/`maxHeight`, `aspectRatio`, `top`/`right`/`bottom`/`left`, `position: static`, `alignContent`. Where ink 8 changed ink 6's answer, the drop-in follows ink 8: the kitty keyboard answer is read off the input stream, Delete is no longer read as Backspace, and a non-interactive debug run ends with a newline.

## 0.2.1

### Patch Changes

- Updated dependencies [[`1945d65`](https://github.com/ofri-peretz/burgee/commit/1945d65f22aafabd380d67f1e40341d6ef3aa6fa), [`1945d65`](https://github.com/ofri-peretz/burgee/commit/1945d65f22aafabd380d67f1e40341d6ef3aa6fa), [`9ebef65`](https://github.com/ofri-peretz/burgee/commit/9ebef654930ac4565f1ee04ec5f8b6f735c6a1d9), [`1945d65`](https://github.com/ofri-peretz/burgee/commit/1945d65f22aafabd380d67f1e40341d6ef3aa6fa)]:
  - closeout@1.0.0
  - paratext@1.0.0
  - roundel@1.0.0
  - caique@0.7.2
  - flagstaff@1.2.1

## 0.2.0

### Minor Changes

- [#816](https://github.com/ofri-peretz/burgee/pull/816) [`5230016`](https://github.com/ofri-peretz/burgee/commit/52300169a98ece41b3544e5316833464e63a7c83) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - controlroom hosts an input line inside a screen (R20): `open(rt, { input: { editor, pane, onSubmit } })` routes keys to caique's line editor while its pane has focus and lets unused keys fall through to the keymap; outside a terminal, entries come from piped stdin, never a wait. closeout gains `bracketedPaste()` in `closeout/cursor`, paired with its restore like the alternate screen.

- [#816](https://github.com/ofri-peretz/burgee/pull/816) [`5230016`](https://github.com/ofri-peretz/burgee/commit/52300169a98ece41b3544e5316833464e63a7c83) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `controlroom/ink` negotiates the kitty keyboard protocol as ink does: pushed at once with `kittyKeyboard: { mode: 'enabled' }`, and in `auto` mode only once a known terminal answers the query, with every other byte handed back to stdin and the pop written at unmount. ink's own suite now passes 584 / 584. paratext's `csi` spells the protocol's three sequences (`kittyKeyboardPush`, `kittyKeyboardPop`, `kittyKeyboardQuery`).

- [#816](https://github.com/ofri-peretz/burgee/pull/816) [`5230016`](https://github.com/ofri-peretz/burgee/commit/52300169a98ece41b3544e5316833464e63a7c83) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - controlroom is no longer a reservation: the screen (`open()`, inline or in the alternate screen, with static and NDJSON projections), the layout and tab state, and `controlroom/ink` ship. The package is held to the family's 100% coverage thresholds.

- [#816](https://github.com/ofri-peretz/burgee/pull/816) [`5230016`](https://github.com/ofri-peretz/burgee/commit/52300169a98ece41b3544e5316833464e63a7c83) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - controlroom hosts plugins (R10): `keymaps` and `panes` register through `controlroom/plugin`'s `register()` against the family schema, a screen takes either by name, and `controlroom check <plugin-file>` reports what a plugin contributes. The family schema every host ships gains the `keymaps` and `panes` definitions.

### Patch Changes

- [#815](https://github.com/ofri-peretz/burgee/pull/815) [`28cb9a5`](https://github.com/ofri-peretz/burgee/commit/28cb9a5e13f3e638a77ecc78bba514113d2b8b3a) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - controlroom's README documents the line that runs packages written for ink on `controlroom/ink` unchanged — `"ink": "file:./ink"`, a two-file package that re-exports the drop-in — and why a bare `npm:` alias cannot: it names a package, not a subpath. `ink-spinner`, `ink-text-input` and `ink-select-input` run that way, as published, in `examples/ink-ecosystem`, and `examples/chat-cli-ink` is the chat boilerplate written for Ink and run on the drop-in.

  The benchmarks measure controlroom's weight gates against ink 6.8.0 on React 19.3.0, each at ≤ 1.0×: the drop-in with React and the reconciler bundled against ink with React (W1, 0.745), the same two installed, in bytes and in packages (W2, 0.378 and 0.238), the native root against ink alone (W3, 0.048), and importing each entry point against importing ink and React (W4, 0.289 and 0.144). A B4 side may now be several imports, with externals, and counted whole when its peers load under top-level await.

- Updated dependencies [[`a47209b`](https://github.com/ofri-peretz/burgee/commit/a47209b3a7774e4ecdd1def3043d19afed5a1266), [`5230016`](https://github.com/ofri-peretz/burgee/commit/52300169a98ece41b3544e5316833464e63a7c83), [`5230016`](https://github.com/ofri-peretz/burgee/commit/52300169a98ece41b3544e5316833464e63a7c83), [`5230016`](https://github.com/ofri-peretz/burgee/commit/52300169a98ece41b3544e5316833464e63a7c83)]:
  - caique@0.7.1
  - closeout@0.7.0
  - paratext@0.9.0
  - flagstaff@1.1.1
  - linegauge@1.0.4
  - roundel@0.6.3

## 0.1.0

### Minor Changes

- [#809](https://github.com/ofri-peretz/burgee/pull/809) [`4f45dbf`](https://github.com/ofri-peretz/burgee/commit/4f45dbf339ee02e4c7721b0099b8b3f486bb86f3) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `controlroom/ink`: a drop-in for `ink` 6.8 — `render`, `renderToString`, `Box`, `Text`, `Static`, `Transform`, `Newline`, `Spacer`, every ink hook and `measureElement` — rendered by the program's own React through React's own reconciler (React 18 and 19), and laid out by a TypeScript port of yoga's flexbox for the props ink exposes, with no yoga. `react` and `react-reconciler` are optional peers: installed alone, the subpath refuses on first import with `E_PEER_MISSING` and `npm install react react-reconciler` as its `fix`, and the package root never loads either. Graded by ink's own suite at 576 of 584 cases and by `@inkjs/ui`'s at 103 / 103, with `'ink'` resolved to the drop-in.

  compat-oracle resolves a target's optional peers from the suite's own tree (`Host.peers`) and can serve a gated file's internal import from the target's own module (`Host.targetInternals`); both ink rows now grade `controlroom/ink`.

  `burgee migrate` reports `ink` → `controlroom/ink` as a graded drop-in path that is not level yet, and does not rewrite it.

### Patch Changes

- Updated dependencies [[`81fc994`](https://github.com/ofri-peretz/burgee/commit/81fc994c27ae7731495c810c4f642ba63d7eb073), [`81fc994`](https://github.com/ofri-peretz/burgee/commit/81fc994c27ae7731495c810c4f642ba63d7eb073), [`f30e011`](https://github.com/ofri-peretz/burgee/commit/f30e011b129abe89c4c79706e4e6a7432c2fab7f), [`f30e011`](https://github.com/ofri-peretz/burgee/commit/f30e011b129abe89c4c79706e4e6a7432c2fab7f)]:
  - caique@0.7.0
  - flagstaff@1.1.0
