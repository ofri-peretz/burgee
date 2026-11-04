---
"caique": patch
---

Two fixes.

- **An autocomplete search whose first match is disabled no longer overflows the stack.** The cursor search stepped by `Math.sign(0)` from a disabled option, which is the same option again; it now searches forward, as upstream does, and lands on the next enabled match.
- **Line-mode `select` and `multiselect` read only an all-digits answer as a number.** `parseInt` read `1 2` as choice 1, `2x` as choice 2, and a label typed out, such as `3 apples`, as choice 3. Those are now refused, and a label that starts with a digit is matched as that label.
