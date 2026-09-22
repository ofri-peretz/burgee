---
'burgee': minor
---

A deprecation now has to name its replacement.

```ts
defineCommand({ name: 'push', deprecated: 'publish', /* … */ });
options: { legacy: { type: 'boolean', deprecated: '--force' } }
```

`deprecated: true` used to produce `(deprecated)` in help and `warning: 'push' is deprecated` on
stderr, which tells the reader to stop without saying where to go. `defineCommand`, and
`Manifest.use()` for plugin commands, now refuse `true` and `''` on a command or any option, and
the error says how to fix it. A named replacement already appeared in all three places:
`(deprecated: use publish)` in help, `deprecated` in `--schema`, and `, use 'publish'` in the
warning.

**Breaking for anyone who wrote `deprecated: true`**: replace it with the name of what to use
instead. Commander and yargs programs running on burgee's front-ends are unaffected. Those
incumbents accept a bare deprecation, and the front-ends keep accepting it.
