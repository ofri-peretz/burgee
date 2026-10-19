---
id: A-20261018-dropped-band-intent-masks-breach
section: A
status: open
source: 'scripts/control-bands.ts writeIntent; the five control-band drops of 2026-10-18'
done_when: 'a breach of a band whose intent is `dropped` or `shipped` writes a new, dated intent, and a test proves it red on the current watcher'
---

**A closed control-band intent silences the next breach of its band.** `writeIntent` in
`scripts/control-bands.ts` writes `.sdlc/intents/control-band-<id>/intent.md` with `flag: 'wx'`
and swallows `EEXIST`. This keeps one open intent per band rather than one per run, which is
right while the intent is open. Once the intent is `dropped` or `shipped`, the same check means
a new breach of that band writes nothing, and nothing says so.

The five `control-band-*` intents were dropped on 2026-10-18
(D-20261018-drop-control-band-core-bundled-bytes and its four siblings). Until this closes, their
decisions say to reopen by hand: delete the directory, or set it back to `draft`.

**Done when** `writeIntent` reads the existing intent's `**Status:**`. If the status is `dropped`
or `shipped`, it writes a new intent beside the old one (`control-band-<id>-<date>`) or replaces
it. The roadmap index lists it either way. A unit test written first fails on the current watcher.
