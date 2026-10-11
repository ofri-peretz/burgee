---
"seniority": patch
---

`seniority/dotenv` follows dotenv 18.0.7: `config()` treats an option passed as `undefined` as not passed, so `{ path: undefined, quiet: undefined }` keeps the `DOTENV_PATH` / `DOTENV_QUIET` (and `DOTENV_CONFIG_*`) defaults instead of overriding them, and `dotenv run` (`seniority/dotenv/cli`) honours a `DOTENV_QUIET` set in the `.env` it loads when neither a flag nor the starting environment said otherwise. dotenv 18.0.7's own suite grades it 191 / 191, level with dotenv itself.
