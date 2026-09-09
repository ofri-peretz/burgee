# linegauge

**Not yet released.** This version reserves the name. The layer is planned as wave **F1** of the
foundation tier: its intent and design are at
[`.sdlc/intents/linegauge/`](https://github.com/ofri-peretz/burgee/blob/main/.sdlc/intents/linegauge/),
under the umbrella
[`cli-foundation-stack`](https://github.com/ofri-peretz/burgee/blob/main/.sdlc/intents/cli-foundation-stack/),
and the measurements behind it are in
[`candidate-layers.md`](https://github.com/ofri-peretz/burgee/blob/main/.sdlc/research/candidate-layers.md)
and
[`replacement-map.md`](https://github.com/ofri-peretz/burgee/blob/main/.sdlc/research/replacement-map.md).
Both artifacts are `draft`; the human gate has not run, and no working release ships before
burgee's compatibility scoreboard is public.

A **line gauge** is the printer's ruler — the steel rule marked in picas and points that a compositor uses to measure a line of type and check it fits the measure it was set to.

That is this package's whole job. Width, wrap, truncate and slice are one problem wearing four names: **cutting styled text without letting the edge come apart** — no dangling escape sequence, no half a grapheme, no severed emoji cluster.

## What it will be

- **One package, not twelve.** `width` · `wrap` · `truncate` · `slice` · `strip` · `widest`. The incumbents split this across `strip-ansi`, `string-width`, `ansi-regex`, `wrap-ansi`, `emoji-regex`, `slice-ansi`, `get-east-asian-width`, `eastasianwidth`, `string-length`, `wcwidth`, `cli-truncate` and `widest-line` — **2.16 B weekly downloads** between them.
- **Grapheme-correct by construction.** ZWJ families, regional-indicator flags, skin-tone modifiers, keycaps, combining marks and East Asian wide characters, over the platform's own `Intl.Segmenter`.
- **Fast path for ASCII.** A byte scan when the string has no non-ASCII code unit; the segmenter only when it earns its cost.
- **Drop-in paths** for `string-width`, `wrap-ansi`, `strip-ansi` and `slice-ansi`, graded by their own suites.
- **Zero external dependencies.**

## Licence

MIT
