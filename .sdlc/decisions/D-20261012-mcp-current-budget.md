---
id: D-20261012-mcp-current-budget
subject: 'The `./mcp` per-entry budget moves by the measured size of each mcp-current requirement, and nothing else does'
taken: Accepted
date: '2026-10-12'
superseded_by: —
---

**The owner's rule, 2026-10-12: R1, R4 and R5 of [mcp-current](../intents/mcp-current/spec.md)
do not fit the `./mcp` per-entry budget in `packages/burgee/src/weight.test.ts` (25,900 B), so
that one budget is raised by the measured amount, rounded up to the next 50 B, with a dated
comment beside it naming the requirement and the measured size.** No core or start-up bundle
ratchet moves, nor `runtime-ratchets.json`, the cold-start bands or
`.sdlc/bands/artifact-size-baseline.json`. `--mcp` loads lazily, through `surfaces.js`, so none of
this reaches a run without the flag, and `.` must measure the same before and after.

The budget has moved eight times before, each with a dated reason, when a protocol feature
landed. This is the same kind of move, recorded once here and once per step in the comment.

## Steps

| Requirement | `./mcp` before | after | budget | `.` before → after |
| :-- | --: | --: | --: | :-- |
| R1, `structuredContent` | 25,850 | 26,215 | 25,900 → 26,250 | 35,105 → 35,105 |
| R2, `outputSchema` | 26,215 | 26,695 | 26,250 → 26,700 | 35,105 → 35,105 |
| R4 and R5, cancellation and progress | 26,695 | 27,991 | 26,700 → 28,000 | 35,130 → 35,130 |
| R3, revision negotiation | 27,991 | 28,177 | 28,000 → 28,200 | 35,538 → 35,538 |

**R1.** `callTool` parses the text it already returns once more and carries the envelope's
`data` as `structuredContent`, wrapped as `{ result }` when it is not an object, or the
envelope's `error` on a failure. The first version was 454 B; destructuring the parse and one
test for a plain object brought it to 365 B.

**R2.** `toolsOf` spreads `outputSchema` from the declared `output.schema` onto each tool, wrapped
as `{ type: 'object', properties: { result }, required: ['result'] }` when the schema is not an
object type, and `structuredOf` wraps a declared command's result by its schema's type rather
than by the value, so a value that is an object under a schema that is not (`anyOf`, say) still
has the advertised shape. 480 B, 42 of them the guard review asked for on #1047: JSON without a boolean `ok` is not an envelope, so it carries no `structuredContent`. The wrap is the rest, and there is nothing in it to share.

**R4 and R5.** 1,296 B, all in `mcp.js` (`.` reads 35,130 on main since #1043, and this does not move it). `serve` dispatches each request without awaiting the one
before and keeps the calls in flight by id, so `notifications/cancelled` aborts that call's
signal and its reply is not sent. Concurrent calls could not share the old capture, which swapped
`process.stdout.write` and the console per call and put them back when the call settled: two
overlapping calls would each restore what the other had swapped in. The capture now follows each
call through `AsyncLocalStorage`, installed once per session, which is also how `ctx.js` finds
the call's signal and progress sender (by `Symbol.for('burgee.mcp')`, with no import edge). A
call with a `progressToken` sends `notifications/progress`, dropping a value that does not rise,
which the protocol forbids. `ctx.js` is a lazy chunk on the command-run path, outside every
static entry graph, and `.` does not move.

**R3.** The owner extended the same rule to R3 on 2026-10-12. 186 B, all in `mcp.js`. `initialize` answers the client's `protocolVersion` when it is
in `SUPPORTED_REVISIONS` (`2025-06-18`, `2025-11-25`), and `MCP_PROTOCOL_VERSION`, now
`2025-11-25`, otherwise ([D-20261012-mcp-version-negotiation](./D-20261012-mcp-version-negotiation.md)).
The first version, a `find` with a `??`, was 224 B; `includes` brought it to 186. The vendored
`2025-11-25` schema is a test fixture and does not ship. `.` reads 35,538 on main at `10edb48`,
and this does not move it.

**Not moved: flagstaff's `.`.** R5 also asks that `flagstaff/progress` report through
`ctx.progress` inside such a call. Built, it measured 282 B on `progress.js`, which flagstaff's
root entry reaches: 29,529 B against that entry's 29,300 budget. This decision covers `./mcp`
only, so that half is not built and waits on the owner.
