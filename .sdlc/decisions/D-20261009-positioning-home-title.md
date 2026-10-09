---
id: D-20261009-positioning-home-title
subject: 'Does the docs home page title keep naming commander and yargs, now that the body leads with what burgee does'
taken: Owner — default stands
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
