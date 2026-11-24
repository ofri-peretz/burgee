---
title: Changelog
description: "Every release of truefit, newest first, from its CHANGELOG.md — what changed and the pull request it came from."
---

## 1.0.1

### Patch Changes

- [#1810](https://github.com/ofri-peretz/burgee/pull/1810) [`102eecf`](https://github.com/ofri-peretz/burgee/commit/102eecf8a30ddab00865ab4e9338602a0e98e46f) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - A missing value now reads `got undefined` in an issue's message, not `got undefined undefined`: the message printed the type and then the value, and for `undefined` both are the word "undefined". Seen from `issues()`, `parse()` and `standard().validate()` on a missing required key.

## 1.0.0

### Major Changes

- [#1798](https://github.com/ofri-peretz/burgee/pull/1798) [`78d014b`](https://github.com/ofri-peretz/burgee/commit/78d014badecbaa3cbf1bfa6aa94be01745359659) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - truefit is 1.0. Its entries `.`, `./emit`, `./jit`, `./formats`, `./json-schema` and `./standard` are now a semver contract: a schema built today reads the same values the same way on every 1.x, and an option or builder is removed or changes meaning only in a 2.0. Nothing changed in the code; the evidence is D-20261124-verification-family-1-0: 100% coverage, every spec row built, 143 of the 154 parity features measured against zod, valibot, arktype, typebox and ajv, and a first full mutation run with no surviving mutant.

## 0.2.1

### Patch Changes

- [#1773](https://github.com/ofri-peretz/burgee/pull/1773) [`80d0383`](https://github.com/ofri-peretz/burgee/commit/80d03839c6d18db2d845dcc9ff51b279a48e207b) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `loadline` is now `truefit` and `truemark` is now `truepass`. npm refused both old names on first publish as too similar to `readline` and `remark`. The code is the same; only the package name, the bin and the docs changed.

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
