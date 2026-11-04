---
"roundel": patch
---

One fix.

- **A grey hex token at 16 colours is the name chalk paints it.** `fly()` rounded each channel of a grey straight to the sixteen, so `#e6e6e6`–`#f8f8f8` flew as `whiteBright` and `#7f7f7f` as `black`. ansi-styles, and `roundel/chalk` with it, send a grey through the 24-step ramp first, whose lightest entry is `#eeeeee`: those greys are `white`. Every grey from `#000000` to `#ffffff` now flies as chalk paints it, and every colour that is not a grey is unchanged.
