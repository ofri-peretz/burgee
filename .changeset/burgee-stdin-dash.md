---
'burgee': minor
---

A positional argument declared with `type: 'file'` treats `-` as standard input: the handler receives the stream as `ctx.stdin`, while the positional still reads `-`. Giving `-` to two file arguments is a usage error, because standard input can only be read once.
