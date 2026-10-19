---
"seniority": patch
---

`seniority/dotenv` follows dotenv 18.0.8: `parse(src, { fast: true })` unquotes a segment that ends at a U+2028 or U+2029 inside an unquoted value, as the regex parser does, and `populate` takes and returns dotenv's own `DotenvPopulateInput` / `DotenvPopulateOutput`, now `string | undefined` because an `undefined` input is copied as given. dotenv 18.0.8's own suite grades it 193 / 193, level with dotenv itself. `seniority/lilconfig` follows lilconfig 3.1.4: its JSON loader drops a leading byte-order mark, so a BOM-prefixed `package.json` or rc file loads instead of throwing. lilconfig 3.1.4's suite grades it 77 / 77.
