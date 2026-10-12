---
id: D-20261011-closeout-late-add
subject: 'closeout: what does `add()` mean while a shutdown is already running?'
taken: Owner — default stands
date: '2026-10-11'
superseded_by: —
---

**Owner**, because every answer changes the behaviour of a published package. Default:
**today's behaviour stands, and is pinned.**

**What happens today.** A handler `add()`ed mid-run joins its phase's `Set`. If the run has
not reached that phase, it runs. If the run has passed it, it never runs: `size` counts it,
no report names it, nothing says so. Found by the Quint model's `lateAddRuns` property
(`.sdlc/intents/closeout/registry.qnt`) and confirmed against `registry.ts` with a `flush`
handler added from inside a `release` handler.

**The honest answers**, none taken here:

- throw from `add()` once `settled` is true — loud, and a plugin that registers lazily breaks;
- invoke it at once, outside phase order — it runs, but possibly after `restore`;
- name it in the report's `unfinished` — nothing breaks, and the report stops lying by omission.

**Pinned by** `models.yml`, which checks `lateAddRuns` as an *expected violation*. When the
code changes and it starts holding, that step fails and this decision has to be superseded.
