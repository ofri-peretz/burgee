# paratext

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
