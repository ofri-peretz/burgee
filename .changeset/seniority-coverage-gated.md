---
"seniority": patch
---

Code no input could reach is removed. There is no behaviour change.

- `seniority check` loses a "(replaces …)" helper it never called, and a map that returned each source name unchanged. It loads one plugin into an emptied registry, so there is nothing for a source to replace. The header now says that.
- `seniority/lilconfig` no longer writes `dirname(p) || sep`, because Node's `dirname` never returns `''`.
- `seniority/dotenv`'s parser no longer checks that a match has a key, because the key group in its pattern is not optional.
- `seniority/rc`'s comment stripper reads characters with `charAt`, so there is no fallback for an index that is always in range.
- The JSON loader behind `seniority/config` quotes the parser's own message without first checking that it threw an `Error`, because `JSON.parse` of a string throws nothing else.
