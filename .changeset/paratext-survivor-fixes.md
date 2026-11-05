---
"paratext": patch
---

One fix.

- **An image's `width` or `height` of `NaN` is left out, as `ansi-escapes` leaves it out.** `image(data, { width: NaN })` and `paratext/term-img` wrote `;width=NaN` into the OSC 1337 sequence. Upstream writes a width or height only when it is truthy; paratext listed the falsy values instead and missed `NaN`. It now asks upstream's question, so `0`, `''` and `NaN` all write nothing.
