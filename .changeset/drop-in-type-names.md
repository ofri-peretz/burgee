---
"roundel": patch
"flagstaff": patch
"linegauge": patch
"closeout": patch
"burgee": patch
---

The drop-ins now export their incumbents' type names, so a TypeScript program migrates by its import alone: `roundel/chalk` gains chalk's `Color`, `ForegroundColor`, `BackgroundColor`, `Modifiers` and `Options`; `flagstaff/ora` gains `Spinner`, `PrefixTextGenerator` and `SuffixTextGenerator`; `flagstaff/boxen` gains `Options`, `CustomBorderStyle` and `Boxes`; `flagstaff/log-update`, `linegauge`, `linegauge/wrap` and `closeout/exit-hook` gain `Options`; `burgee/yargs/parser` gains `Arguments`, `Options` and `Configuration`. Types only — no runtime bytes.
