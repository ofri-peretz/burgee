---
"closeout": patch
---

The README no longer prints an `overrides` recipe: an override points an incumbent's name at closeout's root, which is closeout's own API, so `exit-hook` and `restore-cursor` never linked through it. Each drop-in — now including `closeout/signal-exit`, graded 134 / 135 by signal-exit's own suite — is swapped by import.
