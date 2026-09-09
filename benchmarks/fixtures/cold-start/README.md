# Cold-start fixtures

One CLI per variant, each doing the same trivial work — declare `greet <name>` with a
`--shout` boolean, parse `greet ada`, print `Hello, ada!` — and importing **nothing but
its own framework**.

They exist instead of the demo CLIs in `examples/` because those bins import
`burgee/testing` for `processRuntime`. That is right for a conformance harness and fatal
for this measurement: the commander demo would drag burgee's whole engine into the
"commander" row, and the row would be measuring burgee against burgee.

They are `.mjs` on purpose. A `.ts` fixture would have to run under `tsx`, and the
number would be tsx's startup, which dwarfs everything being compared.
