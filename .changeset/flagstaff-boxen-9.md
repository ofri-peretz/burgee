---
"flagstaff": minor
---

`flagstaff/boxen` is boxen 9.0.0's API, graded 213 / 213 by boxen 9's own suite (control 213 / 213). New options: `footer` and `footerAlignment`, `titleColor`, `borderBackgroundColor`, `maxWidth`; a tab, a backspace or a cursor move inside the text, a label or a border is written the way a terminal would draw it; a border side may be wider than one column or empty; and a size or spacing that is not a usable number means its default. Two of boxen 8's answers change with boxen 9: a hex colour must be real hex (`#GGG` now throws, as it does in boxen 9), and `vertical` / `horizontal` are a fallback for the sides rather than an override of them.
