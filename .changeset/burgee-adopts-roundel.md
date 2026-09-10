---
'burgee': minor
---

burgee consumes `roundel` instead of carrying a copy of it.

`contrast.ts` existed twice — the same WCAG luminance and ratio code in both packages,
identical constants and identical maths, differing only in which package name the hex error
message says. That is what a rule forbidding the dependency arrow produces: it does not
remove the need, it converts it into a copy, which is the one outcome zero-external-deps
exists to prevent.

The family order now runs bottom-up — foundation, output stack, engine — so each layer
consumes the layers below it. burgee is last, because a command declares itself and then
asks the layers beneath it to render, colour and prompt.

What a caller installs still comes from one repo: **zero external dependencies** is
unchanged, and is the claim that was ever worth making.
