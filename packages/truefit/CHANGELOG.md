# truefit

## 0.2.0

### Minor Changes

- [#1767](https://github.com/ofri-peretz/burgee/pull/1767) [`dc457f8`](https://github.com/ofri-peretz/burgee/commit/dc457f890987c9db31dcd952f60c4e0d762ce97b) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `jsonSchemaReader(document)` reads many schemas against one document, such as every payload of an
  OpenAPI document against its `components`: each `$ref` is read once and shared by every schema that
  names it, where `fromJsonSchema` on each reads the whole graph behind it again. A schema that reaches
  a reference that cannot be read is refused every time it is read, however deep the reference is.

## 0.1.0

### Minor Changes

- [#1751](https://github.com/ofri-peretz/burgee/pull/1751) [`d218e73`](https://github.com/ofri-peretz/burgee/commit/d218e734a61c1c3f95f245f1fb784360db3861de) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - First publish. apicontract is now contractdiff (the package, the `contractdiff` command, the
  `contractdiff/testing` import, and the `contractdiff.config.json` and `contractdiff.map.json`
  files), and the validator is now loadline (`import { check } from 'loadline'`). Both are public,
  with a README, a mark and their place in the family.

## 0.0.1

### Patch Changes

- [#1623](https://github.com/ofri-peretz/burgee/pull/1623) [`7167140`](https://github.com/ofri-peretz/burgee/commit/7167140431f7824106a782cc4be578f8ae5be3d0) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - A shape that names a key `Object.prototype` has (`__proto__`, `toString`, `constructor` and the rest) reads it only as the value's own key, in `check`, `issues`, `parse` and an emitted check. Before, `{}` held each of them through its prototype, so a required `__proto__` passed on any object, and an optional `toString` refused `{}`. A getter a class puts on its prototype still counts, and `check` runs at the same speed on every other shape.
