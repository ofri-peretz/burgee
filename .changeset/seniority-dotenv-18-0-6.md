---
"seniority": patch
---

`seniority/dotenv` follows dotenv 18.0.6: `populate` reads `override` and `debug` the way dotenv's `parseBoolean` does, so the string `'false'` (or `'0'`, `'no'`, `'off'`, `''`) turns them off instead of on. dotenv 18.0.6's own suite grades it 181 / 181, level with dotenv itself.
