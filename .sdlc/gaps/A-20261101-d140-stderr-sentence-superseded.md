---
id: A-20261101-d140-stderr-sentence-superseded
section: A
status: open
source: first-adopter A4, oxmutate adoption report friction 4 (`.sdlc/research/adoption/oxmutate.md`)
done_when: 'A dated decision states where a failed `--json` run writes today (the envelope on stdout as D-140 says, and the one clispec R6 line `{"error":{"kind","code","message"}}` on stderr), cites `packages/burgee/src/json-failure.test.ts` and D-20261012-clispec-remainder-built, and says it supersedes only D-140''s sentence "stderr stays empty under `--json`"; D-140 links to it, so a reader of D-140 meets the newer text'
---

[D-140](../decisions/D-140.md) (2026-09-23) answers where a failed `--json` run puts its envelope:
"On stdout, alone, on every front end … stderr stays empty under `--json`." The behaviour moved on.
clispec-conformance R6 shipped in #1015
([D-20261012-clispec-remainder-built](../decisions/D-20261012-clispec-remainder-built.md)), and burgee
now writes one `{"error":{kind,code,message}}` line to stderr on a failure, on purpose.
`packages/burgee/src/json-failure.test.ts` holds it.

D-140 still reads `superseded_by: —`, and nothing in it points at R6. oxmutate's author read D-140,
expected stderr to be silent, and found a line there. The stdout half of D-140 still holds, so the
fix is a newer decision for the one sentence, not superseding D-140 whole.
