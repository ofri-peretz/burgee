---
id: A-20261112-closeout-signal-exit-dcts-node16
section: A
status: open
source: intent `typescript-matrix`, the per-version table (`scripts/typescript-matrix.test.ts` › KNOWN)
done_when: 'The `TS1471` entry is deleted from `KNOWN` in `scripts/typescript-matrix.test.ts` and the three `node16 (ESM consumer)` cells pass without it, on 5.9, 6.0 and 7.0'
---

A project on `module: node16` with `skipLibCheck: false` that imports `closeout/signal-exit` gets
a type error from inside the package, on every TypeScript line measured (5.9.3, 6.0.3, 7.0.2):

```text
packages/closeout/dist/signal-exit.d.cts(6,23): error TS1471: Module './signal-exit-core.js'
cannot be imported using this construct. The specifier only resolves to an ES module, which
cannot be imported with 'require'. Use an ECMAScript import instead.
```

`src/signal-exit.cts` is the CommonJS door and reads the machine with
`import core = require('./signal-exit-core.js')`, and the declaration keeps that line. `nodenext`
accepts a `require` of an ES module, which is why the repository's own type-check and the
`nodenext` cell are clean; `node16` does not. With `skipLibCheck: true` the adopter sees nothing,
and at run time Node 22.13 loads it, so this is a types-only defect on one resolution setting.

`declaration-reach.test.ts` imports the same specifier under `node16` and did not report it,
because it reads the six resolution codes only. The typescript-matrix lock reads every diagnostic
and excuses this one by name until it is fixed.

The fix is in the declaration only: the two types the `.d.cts` names (`Handler`, `Options`) can be
imported with `import type … with { 'resolution-mode': 'import' }`, which `node16` accepts from a
CommonJS file. `signal-exit`'s own suite in `compat-oracle` grades the run-time door and must stay
where it is.
