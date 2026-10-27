---
"seniority": patch
---

`seniority/dotenv/cli` follows dotenv 18.0.9: `dotenv run` reads an empty `DOTENV_PATH` or `DOTENV_CONFIG_PATH` as unset and loads `./.env`, where it used to read the empty string as a path and stop with `EISDIR`. dotenv 18.0.9's own suite grades `seniority/dotenv` 197 / 197, level with dotenv itself.
