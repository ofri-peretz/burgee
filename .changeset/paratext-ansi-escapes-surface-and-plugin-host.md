---
'paratext': minor
---

`paratext` is now call-compatible with `ansi-escapes` for the four OSC members of its surface — `link`, `image`, `setCwd`, `beep` — as both a default export and named exports (`paratext/design.md` R8). The bytes are the incumbent's where the terminal understands them, and the static projection everywhere else: `Docs (https://x.dev)` for a link, the caption for an image, nothing for a `setCwd`. That difference is the reason to swap, and it is the difference between a pipe receiving something readable and a pipe receiving `\u001B]1337;File=inline=1;…`.

Its **CSI half stays out of scope** — the cursor, erasing, scroll regions, the alternate screen, which `flagstaff` draws and `closeout` puts back. Those thirty-three names are nonetheless *declared*, as `undefined`, because ESM refuses a named import of a name a module does not export: without them `import ansiEscapes, { cursorTo } from 'paratext'` was a `SyntaxError` that took the whole file down before a line of it ran. TypeScript types them so that calling one is a compile error rather than a run-time surprise. Graded against `ansi-escapes@7.3.0`'s own suite the row moves **0 / 4 to 1 / 4**, which is its ceiling: three of its four cases assert CSI, so 25% there means complete.

**Two root exports changed shape.** `link` and `image` are now the incumbent's *functions* rather than this package's capability *records*, because a caller who swapped one import specifier would otherwise have got an object shaped nothing like a function, silently. The rule is stated rather than case-by-case — a record export survives unless `ansi-escapes` has that name — so `bell`, `clipboard`, `cwd`, `notify` and `title` are unchanged. The two that moved are reached as `capability('link')` and `capability('image')`, or through `builtins`.

`image`'s encode template gained `preserveAspectRatio` and `size`, upstream's last two options in upstream's order, so `image()` is byte-identical to the incumbent rather than merely call-compatible. `size` is optional in the protocol and required by xterm.js, which is why upstream always writes it.

New subpath **`paratext/plugin`**: paratext hosts `capabilities` (`plugin-contract` R5a). A plugin object registers, every key another layer owns is ignored without complaint, and `attach()` hands the contributions to the same `register()` the built-ins go through — so a third party's capability is not a second-class citizen of the registry. Refusals use the family vocabulary: `E_PLUGIN_SCHEMA`, `E_PLUGIN_CONTRACT`, and `E_NO_STATIC_PROJECTION` for a capability with no `fallback`, which is the same defect flagstaff raises it for in a component and caique in a widget.

`Runtime` gained an optional `cwd`, which is the only thing `setCwd()` needs to default the way the incumbent defaults it to `process.cwd()` — and the way to add it without a second `process` reference in the package.
