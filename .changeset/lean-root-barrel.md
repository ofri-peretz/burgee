---
'burgee': minor
---

**The root barrel stops holding five modules open, and the initial load a consumer pays halves.**

`import { run } from 'burgee'` was loading `help.ts`, `mcp.ts`, `schema.ts`, `plugin.ts`,
`manifest.ts` and `seniority/precedence` whether or not a program read any of them, because
`index.ts` re-exported their value half as a convenience. `execute.ts` already loaded each one
behind an `await import()`; the barrel was the only thing keeping them on the startup path.

Measured over the transitive closure of `import` statements — the bytes a bundler actually puts
on a consumer's startup path:

| | before | after |
| :--- | ---: | ---: |
| `burgee` initial load, bundled | 57,880 B | **28,637 B** |
| `burgee` static graph, on disk | 60,823 B | **42,223 B** |
| cold start, `burgee ÷ cac` | 2.567× | **1.737×** |
| modules Node loads for the import | 22 | 17 |

**Breaking, and narrowly.** Every moved value has a subpath of its own:

| was | is now |
| :--- | :--- |
| `renderHelp` | `burgee/help` |
| `serveMcp`, `toolsOf`, `annotationsOf`, `MCP_PROTOCOL_VERSION` | `burgee/mcp` |
| `schemaOf`, `commandSchemaOf`, `inputSchemaOf`, `summaryOf`, `Manifest` | `burgee/schema` |
| `definePlugin`, `CONTRACT`, `PluginError` | `burgee/plugin` |
| `resolve`, `explain`, `envName`, `screaming`, `ConfigError` | `burgee/config` |

**Every `type` stayed where it was.** A type re-export is erased and costs a consumer nothing,
so the whole type surface — `Manifest` included, which is what keeps `defineProgram`'s return
type nameable — still imports from `burgee`. A typed program that never called one of the moved
functions needs no change at all.

`--explain` and `--schema` also load on their own branch now rather than at import: `schema.ts`
is 2,640 bundled bytes and `seniority`'s explain half is 1,018, and neither runs unless a reader
asks for a document.

This is D-093 reversed. That decision declined the split on a cold-start argument it did not
have a number for; the number is 830 ms of ratio and 29,243 bytes.
