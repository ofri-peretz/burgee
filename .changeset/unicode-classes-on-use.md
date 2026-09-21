---
"linegauge": patch
---

The five Unicode property classes are built on first use, not at import.

A `\p{…}` class under the `v` flag is built when V8 **compiles the literal**, not when the
literal is evaluated — so a module carrying five of them pays for all five at import even if
nothing calls them. Wrapping the literals in functions does not help; only constructing from
a source string does.

Measured on Node 24: `width.js` imports in **5.95 ms against 15.30**, `linegauge` in
**11.60 against 19.00**, and `import 'burgee'` in **21.69 against 33.26**. A caller that
measures a non-ASCII cluster pays the ~10 ms once, on first call.

string-width 229/229, wrap-ansi 80/80, slice-ansi 15/15 and strip-ansi 8/8 are unchanged.
