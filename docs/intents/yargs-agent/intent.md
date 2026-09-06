# Intent — `yargs-agent`: the same floor as yargs middleware

> Stage 1 artifact. Child of [`agent-native-cli-layer`](../agent-native-cli-layer/intent.md),
> step 2b of its order of work: "the same demo built on yargs must pass the same test
> suite. That suite is the contract between the two extensions."

**Status:** review · **Opened:** 2026-09-06 · **Owner:** @ofri-peretz

---

## What is wanted

```ts
import yargs from 'yargs';
import { withAgentMiddleware } from 'yargs-agent';

const cli = withAgentMiddleware(yargs(process.argv.slice(2)));
```

after which the yargs demo passes every F1/F2/F4/O/E case in the conformance suite
that the commander demo passes, byte-for-byte on the envelope and the exit codes, and
the manifest from `--schema` validates against the same `schemaVersion: 1` schema.

## Why now

- **yargs has the larger backlog of exactly these requests**: 199 open issues, of
  which help rendering (cluster 2), error lifecycle (cluster 7) and machine-readability
  (cluster 1) are the biggest — yargs #1005 "list all commands", #2121 "introspect the
  CLI", #2394 "help shown when the handler fails", #1519/#2118 output truncated on exit.
- **A second host is what proves the core is parser-agnostic.** If `@interlace/cli-core`'s
  envelope, error and manifest types need a change to fit yargs, that change is a
  design finding, and better found at v0.2 than v1.
- **The install base is comparable to commander's** (npm trends, 2026-09), so the
  reach of the layer roughly doubles for the cost of one adapter.

## Affected users and systems

- New `packages/yargs-agent`, peer `yargs@>=17`; `examples/demo-cli-yargs`;
  `examples/conformance` gains the yargs parameterisation (intent 1 stubs it).
- `@interlace/cli-core`: only if the contract needs a change — that is the test.
- The npm name `yargs-agent`, free on 2026-09-05.

## Constraints

1. Public yargs API only: `.middleware()`, `.fail()`, `.showHelpOnFail(false)`,
   `.exitProcess(false)`, `.parserConfiguration()`, `.getHelp()`, `.option()`. One
   exception, declared up front: enumerating commands for `--schema` has no public API
   (yargs #1005, open since 2017). The design uses `getInternalMethods()
   .getCommandInstance().getCommandHandlers()` behind a single adapter function with a
   version guard, and opens the upstream PR that would make it public.
2. Same envelope, same `CliError`, same manifest schema as `commander-agent`; the
   conformance suite is shared, not copied.
3. Zero dependencies beyond `@interlace/cli-core`.

## Success criteria

- `examples/conformance` passes with both demos on every case intent 2 added.
- `demo-cli-yargs --schema` and `demo-cli-commander --schema` differ only in fields
  that are genuinely host-specific (recorded in the design as an allowed diff list).
- The upstream yargs PR/issue for public command enumeration is opened and linked.
- No `getInternalMethods` reference outside `src/internals.ts`, pinned by a lock.

## Open questions

None open. Decided at finalisation (2026-09-06):

- **Usage vs runtime in `.fail((msg, err))`**: `err` present → runtime; absent → usage.
  yargs #1797 (sync handler errors bypassing `fail`) is covered because the layer also
  wraps every handler in the after-validation middleware and converts a throw to a
  `CliError` itself; `.fail()` is the fallback, not the only path.
- **`yargs-env` and `yargs-completions` are not planned.** yargs' `.env()`, `.config()`,
  `.completion()` and `.showHidden()` meet V1/V2 and D2 natively; the layer adds only
  `--explain`/provenance (through `yargs-agent`) and static completion generation
  (through the shared renderer, exposed as `yargs-agent`'s `completion` command).
