---
'bellpull': patch
'burgee': patch
'caique': patch
'closeout': patch
'flagstaff': patch
'linegauge': patch
'paratext': patch
'roundel': patch
'seniority': patch
---

Every package's npm `homepage` now points at its page on the docs site, `https://burgee.interlace.tools/docs/packages/<name>`, and each README links it under the header. The keywords add what people and models search for: `burgee` gains `cli-framework`, `argument-parser`, `subcommands`, `json-schema`, `mcp-server`, `model-context-protocol`, `ai-agent`, `llm`, `shell-completion`, `typescript`, `zero-dependency`, `commander-alternative` and `yargs-alternative`; the other eight gain `agent`, `ai-agent`, `non-tty`, `json` and `zero-dependency` where the package does that — `zero-dependency` only on the six that install nothing at all.

`burgee`'s README gains a short FAQ (commander alternative, agent use, MCP, dependencies) and states the compatibility counts the oracle holds — 1,360 / 1,360 of commander's tests and 804 / 804 of yargs' — where it had said 1,215 and 1,185. `caique`'s README no longer calls a released package pre-release.
