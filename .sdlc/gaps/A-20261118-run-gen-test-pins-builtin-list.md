---
id: A-20261118-run-gen-test-pins-builtin-list
section: A
status: closed
source: 'lane ac-agents, 2026-11-18: packages/contractdiff/src/run-gen.test.ts "refuses a generator the plugins do not provide, listing the ones they do"'
done_when: 'the run-gen test derives the expected generator names from builtins (plugins.ts) instead of pinning "types", and a lane that adds a built-in plugin pushes without touching it'
---

**`run-gen.test.ts` pins the built-in generator list to `types`, so the first lane to land a
built-in plugin cannot push.** The refusal for an unknown generator lists every registered
generator (`host.ts` `names`), and the test expects exactly `fix: use one of: types`. With
`markdown` and `mcp` registered it reads `fix: use one of: markdown, mcp, types; …`. Every lane
that replaces a `plugin-<name>.ts` stub (ac-validate, ac-clients, ac-servers, ac-agents …) hits it.

The file belongs to `ac-spine`, so `lane-boundaries-lock` refuses the fix from any other lane, and
the pre-push battery refuses the push without it. The fix, as ac-agents wrote and proved green
(724 tests) before reverting it to stay inside its lane:

```ts
import { builtins } from './plugins.js';
// …
const names = builtins.flatMap((plugin) => Object.keys(plugin.generators ?? {})).toSorted();
expect((await failure(gen({ cwd: root }))).message).toContain(`no generator is named "nope". fix: use one of: ${names.join(', ')};`);
```
