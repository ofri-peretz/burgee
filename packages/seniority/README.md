# seniority

**Not yet released.** This version reserves the name. The layer is planned as wave **F3** of the
foundation tier: its intent and design are at
[`.sdlc/intents/seniority/`](https://github.com/ofri-peretz/burgee/blob/main/.sdlc/intents/seniority/),
under the umbrella
[`cli-foundation-stack`](https://github.com/ofri-peretz/burgee/blob/main/.sdlc/intents/cli-foundation-stack/),
and the measurements behind it are in
[`candidate-layers.md`](https://github.com/ofri-peretz/burgee/blob/main/.sdlc/research/candidate-layers.md)
and
[`replacement-map.md`](https://github.com/ofri-peretz/burgee/blob/main/.sdlc/research/replacement-map.md).
Both artifacts are `draft`; the human gate has not run, and no working release ships before
burgee's compatibility scoreboard is public.

**Seniority** is ranking higher because of longer service or higher position — and therefore taking precedence when there is a conflict. Two people want the same shift; seniority decides.

Config sources have rank. A `--flag` outranks an environment variable, which outranks a project config file, which outranks a home config file, which outranks a default. When they disagree, seniority settles it.

## What it will be

- **One declared order, not per-tool folklore.** Precedence is a truth table you can read and test, not a paragraph in a README.
- **Provenance for every value.** If `out` is `lib`, the answer to *which source set it* is a file and a line — not a shrug. An agent repairing a misconfiguration needs the origin, not just the value.
- **One package, not seven.** The incumbents split discovery and loading across `cosmiconfig`, `find-up`, `locate-path`, `p-locate`, `path-exists`, `import-fresh` and `parse-json`.
- **Drop-in paths** for `cosmiconfig`, `lilconfig`, `dotenv` and `rc`, graded by their own suites.
- **Zero external dependencies.**

## Licence

MIT
