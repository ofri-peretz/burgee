---
'burgee': minor
---

`config explain [command…]` is added automatically to programs that read config. It prints the precedence order (flag > env > config > package.json > default), then each option's resolved value and the source that won, including file and line. The order comes from the resolver itself, so the output always matches what a real run does. Pass `--json` for machine-readable output. A program that defines its own `config explain` keeps it.
