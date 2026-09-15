# paratext

## 0.3.0

### Minor Changes

- [#316](https://github.com/ofri-peretz/burgee/pull/316) [`c8acb28`](https://github.com/ofri-peretz/burgee/commit/c8acb2848714a1cbe3e26a2f9895d7498fb4f096) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `paratext` is now call-compatible with `ansi-escapes` for the four OSC members of its surface — `link`, `image`, `setCwd`, `beep` — as both a default export and named exports (`paratext/design.md` R8). The bytes are the incumbent's where the terminal understands them, and the static projection everywhere else: `Docs (https://x.dev)` for a link, the caption for an image, nothing for a `setCwd`. That difference is the reason to swap, and it is the difference between a pipe receiving something readable and a pipe receiving `\u001B]1337;File=inline=1;…`.

  Its **CSI half stays out of scope** — the cursor, erasing, scroll regions, the alternate screen, which `flagstaff` draws and `closeout` puts back. Those thirty-three names are nonetheless _declared_, as `undefined`, because ESM refuses a named import of a name a module does not export: without them `import ansiEscapes, { cursorTo } from 'paratext'` was a `SyntaxError` that took the whole file down before a line of it ran. TypeScript types them so that calling one is a compile error rather than a run-time surprise. Graded against `ansi-escapes@7.3.0`'s own suite the row moves **0 / 4 to 1 / 4**, which is its ceiling: three of its four cases assert CSI, so 25% there means complete.

  **Two root exports changed shape.** `link` and `image` are now the incumbent's _functions_ rather than this package's capability _records_, because a caller who swapped one import specifier would otherwise have got an object shaped nothing like a function, silently. The rule is stated rather than case-by-case — a record export survives unless `ansi-escapes` has that name — so `bell`, `clipboard`, `cwd`, `notify` and `title` are unchanged. The two that moved are reached as `capability('link')` and `capability('image')`, or through `builtins`.

  `image`'s encode template gained `preserveAspectRatio` and `size`, upstream's last two options in upstream's order, so `image()` is byte-identical to the incumbent rather than merely call-compatible. `size` is optional in the protocol and required by xterm.js, which is why upstream always writes it.

  New subpath **`paratext/plugin`**: paratext hosts `capabilities` (`plugin-contract` R5a). A plugin object registers, every key another layer owns is ignored without complaint, and `attach()` hands the contributions to the same `register()` the built-ins go through — so a third party's capability is not a second-class citizen of the registry. Refusals use the family vocabulary: `E_PLUGIN_SCHEMA`, `E_PLUGIN_CONTRACT`, and `E_NO_STATIC_PROJECTION` for a capability with no `fallback`, which is the same defect flagstaff raises it for in a component and caique in a widget.

  `Runtime` gained an optional `cwd`, which is the only thing `setCwd()` needs to default the way the incumbent defaults it to `process.cwd()` — and the way to add it without a second `process` reference in the package.

- [#294](https://github.com/ofri-peretz/burgee/pull/294) [`3f92a60`](https://github.com/ofri-peretz/burgee/commit/3f92a6099b1b8d5d476c64405ca963d40bf9af45) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - paratext validates against the family plugin schema, with its shape under `capabilities`.

  paratext shipped its own `schema.json` whose root _was_ one capability, so the family had
  three plugin schemas where the contract says one (PRINCIPLES 14, `plugin-contract` R2).
  The capability shape is now `$defs/capability` of the shared file, reached through a
  `capabilities` key beside `spinners`, `tokens` and `components`, and
  `packages/*/src/schema.json` hashes to one value. flagstaff and roundel ship the same
  bytes: their published `./schema.json` gains the capability definitions and nothing about
  what they validate changes.

  `check()` follows the schema's `$defs/capabilityDocument` and takes either shape:

  - a plugin carrying its capabilities under `capabilities`, which is where they live from
    now on, and whose problems are reported at `capabilities.<key>`;
  - **deprecated** — one capability written as the whole document, which is what a 0.2
    capability file looks like. It still validates, and `check()` returns a `deprecated:`
    line saying to move it under `capabilities`. paratext 1.0 stops accepting it
    (`.sdlc/PLAN.md` D2).

  `refusals()` and `isDeprecation()` are exported to tell the two kinds of line apart; the
  lines that are not deprecations are the ones that block, and the ones `register()` throws
  on. `register(capability)` is unchanged: it takes one capability, not a document, so it
  neither reports nor accepts the document-level deprecation.

### Patch Changes

- [#303](https://github.com/ofri-peretz/burgee/pull/303) [`fc640dd`](https://github.com/ofri-peretz/burgee/commit/fc640ddec11255c12d1e0948c5b8e99cc3f3263b) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Stop claiming a drop-in path in the npm description until one is graded.

  The compat oracle now vendors `ansi-escapes`' own suite at 7.3.0 and grades it. The control
  is 4 / 4; `paratext` scores **0 / 4**, and the reason is one line of TAP —
  `SyntaxError: The requested module 'paratext' does not provide an export named 'default'`.
  The ansi-escapes-compatible default export (design R8) is not built, so "Drop-in paths for
  ansi-escapes, terminal-link and term-img" was a claim with a measured zero behind it. The
  description now says what is true — the OSC half of those three packages is covered — and
  defers the drop-in claim to the row that would prove it.

  No runtime behaviour changes.

## 0.2.0

### Minor Changes

- [#229](https://github.com/ofri-peretz/burgee/pull/229) [`6a6442e`](https://github.com/ofri-peretz/burgee/commit/6a6442e9d2cfc001bc3e05d68dab99aa2c9f451e) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The OSC layer, with extensibility as its shape rather than an addition to it.

  Seven capabilities — `link` (OSC 8), `image` (OSC 1337), `title` (OSC 0), `clipboard`
  (OSC 52), `notify` (OSC 9), `cwd` (OSC 50 + 9;9) and `bell` — and **a capability is one plain
  object with no functions in it**: a name, an OSC code, a declaration of when a terminal is
  believed to understand it, and two templates. It can be written in a config file, generated,
  diffed and validated against the published `paratext/schema.json` without running anybody's
  code, which is what PRINCIPLES rule 7 asks for and what an agent needs to ship one in a turn.

  Nothing in this layer is detectable, so every capability carries a static projection and
  `register` refuses one without it: an image becomes its caption, a notification a printed
  line, a hyperlink `text (url)`, and a pipe receives no control byte at all.

### Patch Changes

- [#229](https://github.com/ofri-peretz/burgee/pull/229) [`6a6442e`](https://github.com/ofri-peretz/burgee/commit/6a6442e9d2cfc001bc3e05d68dab99aa2c9f451e) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Name reserved for the OSC layer. `paratext` will own the escape class that addresses the
  terminal _program_ rather than the character grid — hyperlinks, inline images, the window
  title, the clipboard, desktop notifications, the working directory and the bell — each with
  a static fallback for terminals that cannot do it. Exports only its own name until its intent
  and design are approved.
