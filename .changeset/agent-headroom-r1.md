---
'burgee': minor
---

`--schema` is compact by default (agent-headroom R1). The document an agent reads to
discover a CLI drops 42% — 39,512 → 22,964 bytes on the large reference demo — for a
byte-identical parse. `--format=json-pretty` restores indentation for a person reading it.
Both writers change: the engine's `--schema` and the commander front-end's.
