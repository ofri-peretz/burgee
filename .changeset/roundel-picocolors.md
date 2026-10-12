---
"roundel": minor
---

New entry point `roundel/picocolors`: picocolors' default export, its `createColors` and its `isColorSupported`, graded 1 / 1 by picocolors 1.1.1's own `tests/test.js` and bundled at 1,607 B against picocolors' 2,739. Its nine environments from `tests/environments.js` are held byte-equal to picocolors' own source in `picocolors.test.ts`. The forty-one styles are on the default object, not named exports, as with picocolors itself under Node's ES loader.
