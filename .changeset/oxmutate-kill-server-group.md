---
'oxmutate': patch
---

A server killed by the watchdog, or one whose coordinator died, now takes the processes its tests started with it. Each server leads its own process group (not on Windows), and a kill or a lost coordinator ends the group. Before, those processes were re-parented and lived on: 8 uvu runners from one 12-minute compat-oracle warm phase.
