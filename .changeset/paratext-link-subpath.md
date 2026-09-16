---
'paratext': minor
---

New subpath **`paratext/link`** — OSC 8 on its own, **2,337 B**, and nothing registered at import.

The root is 17,574 B and runs `registerBuiltins()` as an import-time side effect, which is correct for a program that wants all seven capabilities and unaffordable for one that wants a clickable URL in its `--help`. `burgee` is that consumer: `help.ts` is imported *statically* by `execute.ts`, so anything help reaches is paid for by `burgee foo --json` as much as by `burgee --help`, and a dynamic `import('paratext')` of a barrel is not shakeable — burgee has a measured 54,986 B failure from exactly that. So the dependency was refused, and the refusal was correct. This entry is the answer to it.

```js
import { link, linkFor, supportsLink } from 'paratext/link';

link('Docs', 'https://x.dev');
// a supporting terminal: ESC ] 8 ; ; https://x.dev BEL Docs ESC ] 8 ; ; BEL
// a pipe:                Docs (https://x.dev)
```

`linkFor(runtime)` is the form a host should use — `burgee`'s renderer already carries a `Runtime`, and passing it means nothing in the path reads `process`. `supportsLink(runtime)` answers the guess without emitting, for a renderer deciding layout rather than bytes. `LINK` is the capability record itself, and it is the *same object* `builtins.link` is rather than a copy: the record moved into this module and `builtins.ts` re-exports it.

**It does not consult the registry, on purpose.** A caller who corrected our terminal guess by re-registering `link` globally does not change what this returns — the registry is what this entry deliberately does not load. `emit(runtime, 'link', …)` on the root is the form that does.

`Support` and `supports()` moved to an internal `supports.ts` so the subpath can ask "does this terminal do OSC 8" without pulling `schema.json`, which is 6,531 B of plugin contract. Both are re-exported from their old home unchanged; no import moved.

Also new: **`packages/paratext/src/weight.test.ts`**, the per-entry-point lock `closeout`, `caique` and `roundel` already carry. Every published entry declares what it may reach, what it may never reach, and what it may weigh, and a new export cannot ship without a rule — `./link` may not reach `capability.js`, `builtins.js`, `index.js`, `plugin.js` or `schema.json`, which is what makes "registers nothing" true by construction rather than by inspection.

Splitting the two modules out cost the root 619 B, 16,955 → 17,574.
