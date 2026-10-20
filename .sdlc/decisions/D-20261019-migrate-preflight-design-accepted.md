---
id: D-20261019-migrate-preflight-design-accepted
subject: 'migrate-preflight: is the Stage 2 design accepted for Build?'
taken: 'Accepted — by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-19'
date: '2026-10-19'
superseded_by: —
---

**Accepted. [`migrate-preflight/spec.md`](../intents/migrate-preflight/spec.md), as re-grounded on
`main` at `e91f842423`, is the design Build implements, and the intent moves `draft → approved`.**
Accepted by the coordinator under the owner's delegation (burgee-owner-delegates-tradeoffs): the
owner delegated Design→Build accepts on 2026-10-12, and the agent that builds the change does not
approve it.

**The design.** Before it writes a file, `burgee migrate` reads the project's `package.json`
(`type`, `engines.node`, `scripts.test`, the `jest` key and the declared dependencies) and any
root `jest.config.*`, and adds a `preflight` list to the report:

- `require-esm`, blocking: a CommonJS project whose `engines.node` admits a Node without
  `require(esm)` (`<20.19.0`, or `21.0.0`–`22.11.x`);
- `floor`, a warning: `engines.node` admits a Node below `20.19.0`, is unreadable, or is absent;
- `jest-cjs`, blocking: jest on a CommonJS project with neither `transformIgnorePatterns` nor
  `--experimental-vm-modules`;
- `untracked`, a warning: what `--force` skipped.

A blocking row on a run that would rewrite a file writes nothing and exits 1, under `--force`
and `--dry-run` alike; with nothing to rewrite, the rows are reported and the exit code is what it
was. The dirty-tree refusal names its paths in `hint`. An in-house range reader (no `semver`)
computes the lowest admitted version. No new exit code, no new dependency, no registry read.
Rows cover the drop-ins of every incumbent the run considers, off-major ones included, because
all five floor findings in the field trial were on projects migrate left untouched.

**Alternatives the spec rejects:**

- rewriting jest config (outside migrate's specifier-only surface, D-050 … D-054);
- blocking on `floor` (an ES-module project on Node 20.0–20.18 or 22.x loads the family);
- treating a missing `engines.node` as Node 0 and blocking CommonJS;
- a tsconfig reader for a `node10` row (`types-under-node10` shipped in #1130 and removed the need);
- naming the dirty paths in `message` (pinned, and matched on by agents);
- rows only for incumbents this run rewrites (would have reported none of the trial's five);
- a `transformIgnorePatterns` naming only the targets' packages (misses the family packages a
  drop-in loads in turn);
- `.gitignore` as the only fix for an untracked-only tree (wrong for a new source file);
- no Quint model (preflight is a gate that refuses or lets a write happen).

**Cost accepted.** A run that used to write and exit 0 now writes nothing and exits 1 when a
blocking row applies. That run's output would not load on a Node the project's own `engines`
promises, or under its own jest. It ships as a `minor` for `burgee`, held by the release window.
