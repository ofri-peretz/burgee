---
id: D-20261025-commander-env-v2-facade-weight
subject: 'commander-env V2 puts an option''s `env` on its `inputSchema` property: is 6 B on every façade ratchet worth it?'
taken: 'Taken by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-25'
date: '2026-10-25'
superseded_by: —
---

**Yes. The four over-incumbent façade ratchets in `scripts/subpath-weight-lock.test.ts` rise by
6 B each:** `burgee/commander` and `burgee/commander/extra-typings` 55,595 → 55,601,
`burgee/commander/v14` 55,944 → 55,950, `burgee/yargs/v17` 110,254 → 110,260.

**What costs the bytes.** `optionProperty` in `packages/burgee/src/schema.ts` copies the keys an
option publishes as declared in one loop (D-20261020-default-command-weight). V2 adds `'env'` to
that list, and the list is in every façade bundle because `--schema` and `--mcp` are. That is
`,"env"` minified: 6 B, measured on the regenerated `/docs/weight` page.

**Why pay it.** `--schema` already published `env` on the option, because it hands the declaration
through. The `inputSchema` property, which is what an MCP client reads, did not. So a tool's
argument could come from a variable the client was never told about. Six bytes is the price of
the machine contract matching itself across both surfaces. The ratchet stays a ratchet: a later
change that shrinks the façade lowers it again.

**Rejected.** *Publish `env` on `--schema` only*: that is what was already there, and it is the gap
V2 names. *A separate pass that only `--mcp` runs*: more bytes than one list entry, because it
would duplicate the loop.
