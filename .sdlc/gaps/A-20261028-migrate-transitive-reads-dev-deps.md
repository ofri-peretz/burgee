---
id: A-20261028-migrate-transitive-reads-dev-deps
section: A
status: open
source: first-adopter second-target proof on emmercm/igir (`.sdlc/research/adoption/igir.md`)
done_when: '`burgee migrate` lists an incumbent under "still installed by another dependency" only when an installed dependency declares it in `dependencies`, `optionalDependencies` or `peerDependencies`, never in its `devDependencies`; a case in `packages/burgee/src` with an installed dependency that lists the incumbent only as a dev dependency, proven red on `burgee@1.9.2` first'
---

On igir, `burgee@1.9.2 migrate` printed:

```text
still installed by another dependency:
  yargs through async; its YError would be different classes, so imports of them stay
```

`npm ls yargs` shows one copy, igir's own. `async@3.2.6` lists `yargs` only in its
`devDependencies`, which npm never installs for a dependency. `transitiveOf` in
`packages/burgee/src/migrate.ts` reads each installed dependency's manifest through `declaredIn`,
and `declaredBy` takes every field in `DECLARING`, `devDependencies` included. That is right for
the project's own manifest and wrong for an installed one.

The cost is small but real: the report names a dependency path that does not exist, and it keeps
imports of `YError` on the incumbent for a reason that does not hold. igir imports no `YError`, so
nothing was left behind here; a project that does would keep yargs installed for nothing.
