---
"burgee": minor
---

A program written in commander's or yargs' own syntax now gets burgee's agent surfaces.

`--mcp` lists every command instead of none: a façade command arrives with no `effects`
because neither incumbent has such a concept, and the filter used to read undeclared as
*not a tool*. It is now listed with `effects: "undeclared"` — absent from the list is
strictly worse for a caller than present with an honest annotation. `withheld` still means
absent.

`tools/call` used to return **nothing at all** — the reply writer was read out of
`_outputConfiguration` at reply time, and the first tool call replaces that so the run can
be captured. A client waited forever. It now answers the `--json` envelope, call after call.

`--json` works at the root of a command group and no longer swallows the operand after it,
and a failure under `--json` is the envelope on stdout with `fix:` rather than prose on
stderr.

commander stays 1360 / 1360 and yargs 804 / 804 against their own suites.
