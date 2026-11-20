---
"oxmutate": minor
---

`container` mode, further: `OXMUTATE_CONTAINER` or `~/.config/oxmutate/config.json` turns it on for
every project on the machine (a project's own setting wins); after the first run only changed files
are synced, and an unchanged repository syncs nothing; the install's npm, pnpm and yarn caches live
in one shared volume (`cache`); `--since` and `--frozen-oracle` work inside; the containers run on
gVisor when Docker has it; and `oxmutate prune` removes everything container mode made.
