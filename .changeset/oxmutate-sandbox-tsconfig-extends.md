---
"oxmutate": patch
---

**The command runner's sandbox keeps a tsconfig `extends` that climbs out of the project resolvable.**
The sandbox is a copy of the project under `<root>/.oxmutate-tmp/sandbox-*/`, two directories deeper
than the project itself. A tsconfig's relative `extends` is resolved from the file that holds it, so a
monorepo package's `"extends": "../../tsconfig.base.json"` pointed at nothing once copied, Vite failed
to load the config, and the dry run stopped with "make the command pass on the unmutated project
first" on a project whose command passes. Each copied `tsconfig*.json` now has its relative `extends`
rewritten to reach the same file from its new place.

Found running oxmutate over the eslint monorepo (`ofri-peretz/eslint`): every package there extends
the root `tsconfig.base.json`, so `testRunner: "command"` could not start in any of them. With the
fix, `eslint-plugin-vercel-ai-security`'s `require-max-steps` ran end to end: 165 mutants, 81.8%.
