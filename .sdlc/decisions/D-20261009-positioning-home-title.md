---
id: D-20261009-positioning-home-title
subject: 'Does the docs home page title keep naming commander and yargs, now that the body leads with what burgee does'
taken: Owner — capability-first title (decided 2026-10-10)
date: '2026-10-09'
superseded_by: —
---

**Default, until the owner says otherwise: the title stays.**
`apps/docs/src/app/(home)/page.tsx` keeps "burgee — the CLI framework that replaces commander
and yargs". Only the body changes (`.sdlc/intents/positioning/`).

**Why it goes to the owner.** The title is a published claim and the site's strongest search
signal. People who search for a "commander alternative" or a "yargs alternative" arrive through
it. Changing it trades that traffic for consistency with the capability-led body. That trade is
about identity and reach, not implementation, so the agent does not take it.

**What the default costs.** The search result names the rivals before it names a capability, so
a reader meets the rivals first. The page body leads with the declaration.

## Decided 2026-10-10

**The title says what burgee does.** The owner chose the default offered in session on
2026-10-10: every docs site's home `<title>` is capability-first, burgee's included —
`burgee — a CLI framework built on one declaration`, `roundel — colour for CLIs`,
`bellpull — subprocesses with one structured result`. The phrases are `HOME_TITLES` in
`apps/docs-chassis/src/home-title.ts`, and every home page, the front door's now among them,
renders its title through `homeMetadata`.

**Where the search signal went.** The incumbents stay in each home page's meta description, in
its last sentence: the npm description's `Drop-in paths for …` clause on a package site, and the
closing clause of `SUMMARY` ("its drop-in paths for commander and yargs are graded by their own
test suites") on the front door. A search for "commander alternative" or "chalk alternative"
still matches the page, and the result's first words say what the package does. The llms.txt
package map drops its leading "— replaces X." for the same reason: each row's description
already names the drop-ins last.

**Held by** `.sdlc/intents/positioning/spec.md` R13 and `scripts/positioning-lock.test.ts`.
