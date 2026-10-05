---
'controlroom': patch
'benchmarks': patch
---

controlroom's README documents the line that runs packages written for ink on `controlroom/ink` unchanged — `"ink": "file:./ink"`, a two-file package that re-exports the drop-in — and why a bare `npm:` alias cannot: it names a package, not a subpath. `ink-spinner`, `ink-text-input` and `ink-select-input` run that way, as published, in `examples/ink-ecosystem`, and `examples/chat-cli-ink` is the chat boilerplate written for Ink and run on the drop-in.

The benchmarks measure controlroom's weight gates against ink 6.8.0 on React 19.3.0, each at ≤ 1.0×: the drop-in with React and the reconciler bundled against ink with React (W1, 0.745), the same two installed, in bytes and in packages (W2, 0.378 and 0.238), the native root against ink alone (W3, 0.048), and importing each entry point against importing ink and React (W4, 0.289 and 0.144). A B4 side may now be several imports, with externals, and counted whole when its peers load under top-level await.
