---
id: D-20261107-burgee-on-oxc-scope
subject: 'burgee uses the oxc engine where it reads code (migrate, its own build), never on the argv path'
taken: 'Taken by the owner, 2026-11-07'
date: '2026-11-07'
superseded_by: —
---

**burgee uses oxc where it reads code, not where it parses argv.** Two parts, each kept or dropped
on its own numbers ([`burgee-on-oxc`](../intents/burgee-on-oxc/intent.md)):

- **`burgee migrate` reads source through an oxc AST**, loaded lazily on the `migrate` path only,
  reusing the oxc core oxmutate already ships where that is feasible. Success is a lower refusal
  rate on the measured corpus (today's rate recorded first: 1 of 77 incumbent-bearing files across
  11 subjects on 2026-11-07, and that one is a missing export, not a parse limit), with A10's
  migrate budget not slower and the cold-start and weight bands unchanged.
- **burgee's own packages build through an oxc-based bundler or minifier**, kept only if the
  existing weight and cold-start benches show smaller packages or a faster cold start. Dropped if
  there is no gain.

**Explicitly not: a native engine on the argv path.** Loading an addon costs more than the argv work
it would replace (`native-engine` M0: 1.6 to 6.0 ms of work, module loading 71 to 87% of a run), it
would break the zero-dependency floor for every consumer, and it would break the bun and deno
runtime smoke. This restates, for oxc, what [D-20261028-native-engine-dropped](./D-20261028-native-engine-dropped.md)
measured.
