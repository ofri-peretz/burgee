---
id: D-20261027-caique-prompt-for-r1
subject: 'caique R1: where promptFor lives, how burgee leaves a missing value to it, what --schema says, and the root budget it costs'
taken: 'A caique/prompt-for subpath; burgee defers a missing value that declares a prompt and hands ctx.json; --schema does not publish the prompt; caique''s root budget 20,700 -> 20,900. Decided under the owner''s delegation of budgets and trade-offs.'
date: '2026-10-27'
superseded_by: —
---

**R1 is `promptFor(command, name?, spec?)` at `caique/prompt-for`.** It wraps a command so that
every declared prompt with no value from any source is resolved through `decide()` before the
handler runs: a person at a terminal is asked; no terminal, `CI`, an agent, `--json` or an
`--mcp` tool call refuse with `USAGE`, naming the flag or the positional as it is typed
(`--dry-run`, `<name>`). burgee reads the refusal by its `code` (P2, D-120) and leaves with exit 2,
or 4 for a cancellation. Five choices the design did not settle, settled here.

1. **Its own subpath, not the root.** `promptFor` reaches the terminal (`createIo`), so a program
   that resolves prompts through `caique/binding` with its own `Io` must not carry it, and one
   that wraps a command must not carry the raw renderer and the keymaps the root re-exports.
   `./prompt-for` measures 15,505 B, budgeted at 15,600 in `weight.test.ts`.

2. **burgee defers; it does not import.** A missing required option or positional that declares a
   `prompt` is no longer refused by the engine (`execute.ts`, `parse-refusals.ts`): it reaches the
   handler, which `promptFor` has wrapped. Help still prints `<name>` and `(required)`, and
   `--schema`'s `required` still lists it, because a program reading them must still pass it. The
   alternative — `promptFor` marking the option optional so the engine lets it through — would
   have told every agent reading `--schema` that the value is optional. The type is
   `PromptDeclaration`, structural; burgee never imports caique.

3. **`ctx.json` is handed to every handler.** R6 says `--json` means nobody is there to type, and
   an `--mcp` tool call is a `--json` run, but a handler had no way to know it: `ctx.options` holds
   the command's own options, and `ctx.runtime.argv` holds the colour flags only. A person who runs
   `cli greet --json` at a terminal would have been asked. It is also what `roundel/policy`'s
   `ModeOptions.json` asks for by name, so flagstaff's `hoist` can take its `json` mode inside a
   burgee handler (D-20261027-prompt-spinner-composed).

4. **`--schema` does not publish a prompt.** burgee publishes a command's options and arguments as
   declared, so a declared `prompt` would have appeared in the demo's `--schema`, taking it from
   4,656 B to 4,713 B against its 4,700 B gated budget (`benchmarks/axes/reliability.ts`,
   `SCHEMA_BYTES_BUDGET`). Whoever reads `--schema` is a program, which is never asked; the
   refusal tells it the flag. `promptFor` gives each declared prompt a non-enumerable `toJSON`
   that returns `undefined`, so `JSON.stringify` leaves the key out and nothing else sees a
   difference. burgee's core pays nothing. A prompt written straight into `defineCommand` without
   `promptFor` would publish; the docs say to declare it through `promptFor`.

5. **The question is asked on stderr.** stdout is the command's data: `cli new > out.json` must
   not put the question in the file. `runtime.ts` gains `promptStreams()`, stdin and stderr.

**The terminal is opened only to ask, and closed before the handler runs.** The first version
closed it in a `finally` around the handler; `.sdlc/intents/caique/interrupt.qnt` found the handler
running with stdin still raw in two steps (ask, answer), so a Ctrl+C pressed during a long handler
was a byte to a question already answered. The model describes the fix, and four rejected designs
(that one, no exit-path registration, an eagerly opened terminal, a registration never released)
each still fail its `safety`.

**caique's root budget, 20,700 -> 20,900.** Measured 20,826 B (+150): the `flag` a refusal names,
threaded through `decide` and `binding`, and `promptStreams()` in `runtime.ts`, all three of which
the root re-exports. Product, not drift; `promptFor` itself is behind its own door.
