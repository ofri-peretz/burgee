---
'burgee': patch
---

`import 'burgee'` loads less at startup. What a failed run prints — the exit-code classification, the `--json` failure envelope and the prose on stderr — now loads only when a run fails, so a run that succeeds never pays for it. The core bundle drops from 30,107 to 27,996 bytes. Output and exit codes are unchanged.
