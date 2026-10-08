# ink-ecosystem — packages written for ink, on controlroom/ink

controlroom R17: `ink-spinner` 5.0.0, `ink-text-input` 6.0.0 and `ink-select-input` 6.2.0,
installed from npm as published, import from `'ink'`. This project's `package.json` resolves
`'ink'` to `controlroom/ink` with one line, and `ecosystem.test.mjs` runs each component,
unmodified, with a check on what it drew and what it reported:

```json
"ink": "file:./ink"
```

`ink/` is a two-file package, `export * from 'controlroom/ink'`, versioned at the ink API the
drop-in implements (8.0.0), so each component's peer range on ink is met and npm installs no
other ink. The test checks that first: every component's own `import 'ink'` must land on the
drop-in, or the rest would pass on ink and prove nothing.

It is not a workspace of this repository. In a monorepo a package named `ink` that is not ink
takes the root `node_modules/ink` from the real one, so
[`scripts/ink-alias-lock.test.ts`](../../scripts/ink-alias-lock.test.ts) installs it alone, as
a user would, against `controlroom` packed from this tree, and runs `npm test` there.
