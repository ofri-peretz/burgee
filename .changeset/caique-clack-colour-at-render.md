---
"caique": patch
---

**`caique/clack` paints its list hints and its required refusal when it draws them, and nests colours the same way on every Node.**

- The `↑/↓ to navigate` hints under `select` and `multiselect`, and the refusal a required multi-selection shows ("Please select at least one option. Press space to select…"), were painted once, when the module loaded. They took whatever colour support the process had then, not the stream's when the prompt drew, so a prompt in a terminal could show them uncoloured. They are now painted per frame, as clack paints them.
- On Node 22.13, an inner colour closing inside an outer one ended the outer one too: the yellow refusal lost its colour after ` space `. Node 24 reopens the outer colour there, as picocolors does for clack; `caique/clack` now does the same on every Node it supports.
