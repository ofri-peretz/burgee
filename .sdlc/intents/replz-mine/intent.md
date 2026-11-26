# Intent — `replz mine`: propose rule candidates from review comments and reverts

> Split out of [`replz`](../replz/intent.md) R5 on 2026-11-24, when replz was cut at 1.0
> ([`D-20261124-replz-1-0`](../../decisions/D-20261124-replz-1-0.md)). The case-drafting half of
> R5 shipped as `replz propose`; this is the other half. A new command, so a minor of replz 1.x.

**Status:** review · **Opened:** `2026-11-24` · **Owner:** `@ofri-peretz`

---

## What is wanted

- **`replz mine`** reads merged pull requests' review comments and reverts through `gh`,
  clusters them, and writes each pattern seen in at least two pull requests, and detectable from
  a diff, to a draft file of rule candidates.
- A person accepts each candidate in a pull request; nothing becomes a rule by itself.

## Why now

replz measures the reviewer and the checks against past bugs. Mining says which check is missing:
a finding a reviewer keeps writing by hand is a lint rule or lock test nobody has written yet.

## Constraints

- No dependency outside the burgee family; `gh` is called as a process, as `propose` calls git.
- Review comments are public repository data; the draft file holds no other personal data.

## Success criteria

- `replz mine` on burgee's merged history writes at least one candidate seen in two or more pull
  requests, and a person turns one into a lint rule or lock test in a pull request.

## Status

Built on 2026-11-26 as `replz mine` (`packages/replz/src/mine.ts`). On burgee's last 30 days it drafts
one candidate, a missing changeset named by hand in four pull requests, in
[`.sdlc/replz/rule-candidates.md`](../../replz/rule-candidates.md). The second criterion, a person
turning a candidate into a rule, is open. Reverts are not mined yet: a revert's subject names what
was undone, not what was wrong, so it adds no words a rule could match.
