---
id: D-20261018-drop-docs-deploy
subject: 'docs-deploy: folded into docs-per-package, which generalises its R1–R6 from one app to N'
taken: 'Taken — on the owner''s delegation of 2026-10-12, applied by the roadmap-to-shipped program of 2026-10-18'
date: '2026-10-18'
superseded_by: —
---

**Dropped as a separate intent. Its open criteria move to `docs-per-package`, which already claims them.**

`docs-deploy` deployed `apps/docs` to `burgee.interlace.tools`. The site has been live since
2026-09-09. Its row has held at `review` because criteria about the deploy pipeline stayed open:
the post-deploy SHA gate, preview dispatch, and turbo-affected `docs`.

**Evidence that it is folded, not abandoned.** `docs-per-package/spec.md` opens with "Parent
design: `docs-deploy/spec.md`, whose R1–R6 this one generalises from one app to N". Its intent's
Constraint 2 restates every docs-deploy constraint per package: `main` only, Vercel Git
integration off, no per-branch previews, `RELEASE_APPROVAL` on manual production deploys, and an
`x-build-sha` check after every deploy. Its spec's "Turbo-affected, honestly" section takes the
turbo criterion. An app-by-app deploy that works for N apps is the one-app case with N = 1. Two
intents over one pipeline means two status lines that can disagree.

**What covers it instead.** `docs-per-package` (`approved`). Its open rows, C8 and the R2, R7
and R10 locks, are queued in batch 17 of the roadmap-to-shipped tracker
(`.sdlc/research/roadmap-to-shipped-2026-10.md`).

**How to reopen.** Only if `docs-per-package` is itself dropped, or `apps/docs` leaves the
`.github/vercel-apps.json` table. Then the one-app pipeline needs its own owner again.
