---
"provedone": minor
---

Rename proofline to provedone, the npm name chosen for its first release (the name proofline belongs to another package): the package, the bin and every command the CLI prints. provedone moves a clone's `.git/proofline/` log to `.git/provedone/` on first use, so the observe history carries over; `PROOFLINE_MODE` and `PROOFLINE_SESSION` become `PROVEDONE_MODE` and `PROVEDONE_SESSION`.
