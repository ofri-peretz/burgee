---
id: D-20261018-drop-eslint-plugin-cli-floor
subject: 'eslint-plugin-cli-floor: the lane moved to ofri-peretz/eslint, where the rules merged; the intent here is dropped'
taken: 'Taken — on the owner''s delegation of 2026-10-12, applied by the roadmap-to-shipped program of 2026-10-18'
date: '2026-10-18'
superseded_by: —
---

**Dropped here, because the work lives and shipped in another repository.**

The intent asked for the L half of burgee's "R + L" requirements: lint rules that hold the floor
statically, plus a `migrate-import` autofix. Its index row has said "the package does not exist"
since 2026-09-09, and that is still true of this repository. An eslint plugin belongs in the
eslint family's repository. PRINCIPLES "one repo per family" says so.

**Evidence.** Gap `C-20260922-cli-floor-lint` is closed: `eslint-plugin-cli-floor`, four rules,
merged in ofri-peretz/eslint#1137 (`464385ff73`). Its first npm publish is the owner's, and is
tracked there. No file in this repository implements or tests any of the intent's rules, so
nothing here was holding it.

**What covers it instead.** `eslint-plugin-cli-floor` in ofri-peretz/eslint, and gap
`C-20260922-cli-floor-lint`. Two intents here still name the lint half, and the roadmap tracker
queues both for restatement against this drop: `burgee` F3, O3 and P1, and `cli-mcp`'s lint rule.
They should point at the eslint repository, not at this intent.

**How to reopen.** Not here. A change to the rules is an intent in ofri-peretz/eslint. If burgee
itself ever needs a lint-shaped check, such as a rule shipped inside `burgee check`, that is a new
intent with its own design.
