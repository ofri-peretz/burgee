---
"burgee": minor
---

A repeatable option can now keep each value whole: declare `separator: false` and
`--note "a, b" --note c` reads as `['a, b', 'c']`, from flags and from the environment alike.
Before, every `multiple` option was split on `,` unless another separator was declared, so prose
that carries commas came apart. In a completer's `raw` context, a failed kept-whole option's
values are joined by a newline.
