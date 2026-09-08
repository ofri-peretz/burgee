---
"roundel": patch
---

The first working release: `roundel/policy` (`outputMode`, `colorLevel` — one answer for the whole family, no colour under any mode but `tty`), `roundel/tokens` (nine semantic tokens over `util.styleText`, identity off a terminal, truecolor → 256 → basic fallback for hex), `roundel/theme` (`fly()` once per program, refusing a truecolor token under 4.5:1 against the declared ground) and `roundel/contrast` (the WCAG maths). Zero dependencies; each subpath imports only itself and `./policy`; `./tokens` stays under picocolors. Still 0.0.x: the chalk façade and the 0.1.0 release wait for the compatibility page.
