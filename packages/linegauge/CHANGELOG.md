# linegauge

## 0.1.0

### Minor Changes

- [#182](https://github.com/ofri-peretz/burgee/pull/182) [`28a838f`](https://github.com/ofri-peretz/burgee/commit/28a838f0c1314fb79594d9d8bd8e02de785ea80a) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `linegauge` is real: `width` and `wrap` move out of `flagstaff` into the foundation
  package that was reserved for them (F1, the move only). The default export is `width`,
  call-compatible with `string-width`'s default. `flagstaff` imports them and deletes both
  files; its 227 tests pass unchanged, and B4's bundled bytes are identical to the byte —
  the code went to a different file, not away.

### Patch Changes

- [#193](https://github.com/ofri-peretz/burgee/pull/193) [`8586f58`](https://github.com/ofri-peretz/burgee/commit/8586f58542e7896675c0b6fa8815278f8d22d4a3) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Name the tool the package is named after.

  The npm description opened with "the width of material a saw removes in a cut" — that is a
  _kerf_, a different tool from a different trade. A line gauge is the printer's steel rule
  marked in picas and points, which is what a package that measures typeset width actually
  does. The description is the first line a reader sees on npm, so it may as well be the one
  that explains the name.

  No behaviour change.
