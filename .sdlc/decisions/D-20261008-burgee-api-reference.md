---
id: D-20261008-burgee-api-reference
subject: 'What goes in burgee''s generated API reference, given that five of its sixteen typed entries are drop-ins mirroring commander, yargs, yargs-parser and meow'
taken: Taken
date: '2026-10-08'
superseded_by: —
---

**Every typed entry gets a page under `apps/docs/content/docs/api/`. The native entries are
documented in full. The five drop-ins get a short page that names every export and links to
the incumbent's own docs.** The changelog is `apps/docs/content/docs/changelog.md`, projected
from `packages/burgee/CHANGELOG.md` the way the foundation sites' changelogs are.

**Native, in full** (signature, doc comment, parameters, examples, as on the foundation
sites): `burgee`, `burgee/plugin`, `burgee/help`, `burgee/mcp`, `burgee/schema`,
`burgee/config`, `burgee/brand`, `burgee/contrast`, `burgee/cli`, `burgee/testing` and
`burgee/completions`. This is burgee's own API, and nothing else documents it.

**Drop-ins, linking out:** `burgee/commander`, `burgee/yargs`, `burgee/yargs/helpers`,
`burgee/yargs/parser` and `burgee/meow`. Their API is the incumbent's, and the incumbent
already documents it. Rendered in full, `burgee/yargs` alone was 62 KB, mostly `@types/yargs`
restated, and `burgee/commander` was 29 KB. A second copy of someone else's reference would
drift from theirs and add nothing a reader can act on. Each page instead gives:

- the incumbent's npm page at the release its suite is graded at (`GRADED_VERSIONS`);
- the compatibility page, which says how closely the entry matches;
- the `vs/<host>` comparison, when the family app has one;
- what `burgee migrate` does with the import.

**Which entries count as drop-ins is not a hand list.** It is `DROP_INS` in
`packages/burgee/src/compat.ts`, the same table `burgee migrate` rewrites from. A new façade
links out without anyone editing the generator, and a native entry cannot be turned into a
link-out page by mistake. `scripts/api-reference-lock.test.ts` reads `DROP_INS` itself and
fails if any page is in the wrong form.

**The lock is not weakened for the short pages.** Each still names every export, as a
`| name | kind |` row, so the "every export is on its page" check runs over all sixteen
entries unchanged. A drop-in page that loses a name fails it, and the lock's
refuses-what-it-exists-to-refuse block proves that with `burgee/yargs/helpers`.

**Where it lives in the generator.** `STANDARD_SITES` is the wrong list. Those packages each
have an app of their own, and `pages()` refuses the `familyPages` app. burgee's site is the
family app, which also carries the family-wide pages. So burgee is in a separate list,
`FAMILY_SITE_REFERENCES` in `scripts/api-reference.ts`. `REFERENCED` is the union of the two,
and it is what the generator, `--check` and the lock iterate. `sync-package-docs.ts` reads the
same list to write the family app's changelog.

**Scope.** The link-out form applies only to `FAMILY_SITE_REFERENCES`. The foundation sites'
façades (`flagstaff/ora`, `roundel/chalk`, …) keep their full pages. Those APIs are small, and
changing them is a separate decision.
