---
'burgee': patch
---

**🐛 Fix** — help screens wrap against the real width: `width`, `strip` and `wrap` come from `linegauge`

`burgee/yargs`' cliui port carried its own `stringWidth`, `stripAnsi` and a wrap-ansi
implementation. The strip was wrong: the ITU T.416 sub-parameter form
`ESC[38:2::255:0:0m` — what chalk emits for truecolor — left `:2::255:0:0m` in the string,
so a 13-column string measured as 25 and every help screen wrapped against a width that was
not the width. linegauge owns measuring and wrapping text and had already fixed it.
