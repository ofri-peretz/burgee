---
'roundel': minor
---

`audit()` and `reportTheme()` — ask whether your colouring meets WCAG AA and get rows back
instead of an exception. Two rows per hex token, `truecolor` and `256`, because those are the
two colours a terminal can be sent; none for 16, whose values are the user's own theme.
`fly()` is now a filter over `audit()`, so the refusal and the report cannot disagree.
