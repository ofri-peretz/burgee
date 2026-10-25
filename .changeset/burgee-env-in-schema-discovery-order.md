---
"burgee": minor
---

An option's environment variable is part of the machine contract, and the config discovery
order can be read. An option declared with `env` now carries that name on its `inputSchema`
property, in `--schema` and in `--mcp`'s `tools/list`, as it already did on the option itself.
`config explain` lists, under the option rows, every path discovery tries in order, why each is
tried, and which file was read (`discovery: off` under `--no-config`, the one path under
`--config`); `--json` carries the same as `data.discovery`. `--explain <option>`, when a config
file won, names that file and its place in the discovery order. Both are loaded only on those
two paths.
