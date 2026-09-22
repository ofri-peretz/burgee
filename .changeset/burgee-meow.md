---
'burgee': minor
---

`burgee/meow` — meow's surface, over burgee.

`import meow from 'burgee/meow'` takes the place of `import meow from 'meow'`: the options
object, the flags contract (`type`, `default`, `shortFlag`, `aliases`, `choices`,
`isRequired`, `isMultiple`), `commands`, the help and version blocks with `autoHelp` and
`autoVersion`, `showHelp`/`showVersion`, and the `input`/`flags`/`unnormalizedFlags`/`pkg`
result. Graded by meow's own suite at **132 / 148 (89.2%)** against a control of 146 / 148.

meow is one function over `yargs-parser`, and burgee already ships its own for
`burgee/yargs`, so this takes no new dependency into the tree. The entry costs 59,820
bundled bytes; upstream meow looks lighter only because it depends on `yargs-parser` rather
than carrying it, and a caller installing meow installs both.
