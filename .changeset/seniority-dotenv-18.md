---
'seniority': minor
'burgee': minor
---

`seniority/dotenv` now follows dotenv 18, graded by dotenv 18.0.5's own suite at 179 / 179, level with dotenv itself (it was 106 / 141 against 17.4.2). `config()` takes its defaults from `DOTENV_PATH`, `DOTENV_ENCODING`, `DOTENV_QUIET`, `DOTENV_DEBUG`, `DOTENV_OVERRIDE` and `DOTENV_FAST`, or their older `DOTENV_CONFIG_*` names. It reports `◇ injected env (n) from <paths>` on `console.error` unless quiet, and its debug lines behind `┆` on `console.log`. `parse(src, { fast: true })` is dotenv's character scanner, and the regular-expression parser now expands `\n` in a value that opens with a double quote even when the quote never closes, as dotenv does. `configDotenv` is exported. Two entries are new: `seniority/dotenv/config` (`import 'dotenv/config'`, quiet unless asked) and `seniority/dotenv/cli` (`dotenv run`, with signal forwarding). `.env.vault`, `DOTENV_KEY` and `decrypt` are not built, because dotenv 18 removed them (D-20261001-seniority-dotenv-vault).

`burgee migrate` now rewrites `dotenv` to `seniority/dotenv`, and `dotenv/config` and `dotenv/config.js` to `seniority/dotenv/config`, on dotenv 18. A project on dotenv 17 is left alone and listed under `offMajor`: 17's own suite grades the drop-in 107 / 141, because the façade speaks 18.
