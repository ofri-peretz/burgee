# controlroom

## 0.1.0

### Minor Changes

- [#809](https://github.com/ofri-peretz/burgee/pull/809) [`4f45dbf`](https://github.com/ofri-peretz/burgee/commit/4f45dbf339ee02e4c7721b0099b8b3f486bb86f3) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `controlroom/ink`: a drop-in for `ink` 6.8 — `render`, `renderToString`, `Box`, `Text`, `Static`, `Transform`, `Newline`, `Spacer`, every ink hook and `measureElement` — rendered by the program's own React through React's own reconciler (React 18 and 19), and laid out by a TypeScript port of yoga's flexbox for the props ink exposes, with no yoga. `react` and `react-reconciler` are optional peers: installed alone, the subpath refuses on first import with `E_PEER_MISSING` and `npm install react react-reconciler` as its `fix`, and the package root never loads either. Graded by ink's own suite at 576 of 584 cases and by `@inkjs/ui`'s at 103 / 103, with `'ink'` resolved to the drop-in.

  compat-oracle resolves a target's optional peers from the suite's own tree (`Host.peers`) and can serve a gated file's internal import from the target's own module (`Host.targetInternals`); both ink rows now grade `controlroom/ink`.

  `burgee migrate` reports `ink` → `controlroom/ink` as a graded drop-in path that is not level yet, and does not rewrite it.

### Patch Changes

- Updated dependencies [[`81fc994`](https://github.com/ofri-peretz/burgee/commit/81fc994c27ae7731495c810c4f642ba63d7eb073), [`81fc994`](https://github.com/ofri-peretz/burgee/commit/81fc994c27ae7731495c810c4f642ba63d7eb073), [`f30e011`](https://github.com/ofri-peretz/burgee/commit/f30e011b129abe89c4c79706e4e6a7432c2fab7f), [`f30e011`](https://github.com/ofri-peretz/burgee/commit/f30e011b129abe89c4c79706e4e6a7432c2fab7f)]:
  - caique@0.7.0
  - flagstaff@1.1.0
