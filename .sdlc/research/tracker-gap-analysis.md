# What the trackers actually say, 2026-09-07

A full re-pull of every open item in `tj/commander.js` and `yargs/yargs`, ranked and
clustered. Complements [`competitor-open-issues.md`](./competitor-open-issues.md), which
read six repos at breadth; this reads two at depth and adds the closed-as-not-planned
record, which turns out to matter more than the open one.

## The first surprise: commander's tracker is not a demand signal

| | commander | yargs |
| :--- | ---: | ---: |
| Stars | 28,387 | 11,511 |
| **Open items** | **8** | **211** |
| Open PRs | 2 | 12 |
| GitHub Discussions | none | none |
| Open items predating 2023 | — | **172 (86%)** |

Eight open items against 28,000 stars, and no Discussions board to absorb the overflow.
Commander's demand is visible only in what it has **closed as not-planned**:

| Closed not-planned | Engagement | Open for | Subject |
| :--- | :--- | :--- | :--- |
| #1801 | 14 👍 · 31 💬 | 2022 → 2025 | localisation |
| #2147 | 15 💬 | | multiple usages |
| #2434 | | → 2025-10 | **CLI parsing and startup performance** |
| #2222, #2245, #2351 | | | flag forms, sub-options, option tuples |

yargs is the mirror image: an archive rather than a roadmap. Twelve open PRs, all from
2026, all small fixes, against 199 issues of which 172 predate 2023.

**We are not competing against a roadmap. We are competing against two frozen APIs.**

## The finding that matters most: nobody has framed this as an AI problem

Every open item in both repos was scanned for `AI, LLM, agent, agentic, MCP,
machine-readable, JSON output, structured output, programmatic, non-interactive,
introspect`.

**Two hits. Both are PR-hygiene disclaimers** ("this PR was prepared with AI assistance",
yargs #2567 and #2548). **Zero feature requests** mention agents, LLMs, MCP or tool-calling
as a use case.

And yet the need is filed six separate times, in the vocabulary of its era:

| Issue | Opened | Asks for |
| :--- | :--- | :--- |
| yargs #1005 | 2017 | list all commands — "in a list, or a directory-style tree, **or a json**" (a 250-command CLI) |
| yargs #1210 | 2018 | completions with metadata — "**piped directly to PowerShell as JSON**" |
| yargs #2121 | 2022 | "**introspect the CLI and provide command metadata**" |
| yargs #1838 | 2020 | an API to ask whether a command string is known |
| yargs #1605 | 2020 | invoke a command programmatically |
| yargs #2107 | 2021 | resolve an alias to its canonical command after dispatch |

The youngest is four years old. Every one is open. And the state of the art in the thread
is this, from the final comment on yargs #684 (2024-10-16):

> "Currently **hijacking the `help` command, and parsing its default output** to achieve
> this, but there are some unwanted side effects."

— followed by forty lines of TypeScript that disables `.help(false)`, registers a fake
`help` command, and regex-scrapes `Commands:\n( {2}.+(?:\n|$))*` out of rendered help text.

**That is the incumbent state of the art for machine-readable CLI structure in 2026**, and
it is exactly what `--schema` (F1) replaces. The territory is uncontested because the
people who need it have been asking in the wrong vocabulary for nine years.

## The declines, in the maintainers' own words

- **yargs #684** — group commands in help. **49 engagement, the highest open item in either
  repo, open 9 years 10 months.** The maintainer, 2019: *"I continue to think this would be
  a slick feature, if anyone wants to take it on."* Eleven `+1` comments follow, the last
  in 2024.
- **yargs #2234** — async config parsing. Labelled **`wontfix` and left open**.
- **`next-major` as indefinite deferral** — #1079 (2018), #878 (2017), #1864 (2021) carry
  it. yargs has since shipped v17 and v18 without them.
- Eleven yargs issues carry `Help Wanted`, including four of the top ten.

## Clusters, and who has to fix them

| Cluster | Open | Parser, or the layer above? |
| :--- | ---: | :--- |
| Help rendering and layout | 24+ | **above** — and it is the #1 request in either repo |
| Completions | 19 | **above** (except negated booleans, #2254) |
| TypeScript fidelity | 18 | **above**, but only if the parser's model is typed from the start |
| Module system / runtime portability | 16 | **above** — `commandDir` is ESM-broken across 7 issues |
| Validation relations between options | 15 | **above**, but must run before dispatch |
| Config file loading | 13 | **above** |
| Environment variables | 8 | **split** — merge order is the parser's, naming is above |
| **Async / execution model** | 8 | **above** — see below |
| **Parser semantics proper** | ~20 | **parser** — and a short, tractable list |

### The highest-value unfixed defect

**yargs #1069** — the parse callback fires *before* the handler's promise resolves.
Second-highest engagement in either tracker, open **8 years 7 months**, last touched 2020.
With #1399, #2118, #2394, #1975, #1797 and the `wontfix`-labelled #2234 it is one theme:
**both libraries' handler lifecycles predate promises and neither has retrofitted them.**
burgee's E4 lifecycle answers it directly, and that is worth more than any feature.

### The parser list is short enough to be a spec

`--` terminator propagation (commander #2530/#2577, yargs #1527, #2423) · single-dash stdin
(#1312, 17 👍) · boolean arity (#1532, #1318, #1098) · quote handling (#1324, #2416) ·
env-var value sources (#873, #821, #2501, #2005) · number coercion (#1079).

Not a research problem — a correctness spec, and one we can satisfy on day one precisely
because we are not bound to their existing behaviour.

## The finding that cuts against us

**commander #2505 — the maintainers' own plugin-API RFC — has drawn 1 comment and 0
reactions in five months.** yargs #1751 and #2298 are the nearest equivalents and are
similarly quiet.

Stated plainly because it is inconvenient: **there is no tracker demand for a plugin
system.** Our J7/J8 work is justified by architecture and by the Vite precedent, not by
anyone asking for it.

Two readings, and we should hold both:

- *Against the caution:* absence of demand for a capability neither framework has ever had
  is weak evidence. Nobody filed an issue asking commander for Vite's plugin ecosystem
  either, and Vite's plugin API is a large part of why Vite won.
- *For the caution:* plugins must not be the headline. **The headline is the introspection
  gap** — six issues, nine years, and a regex-scraper as the state of the art. Plugins are
  what makes the ecosystem compound *afterwards*.

Recorded so `cli-modularity` is scheduled on its architectural merit rather than an
imagined demand signal, and so `docs-deploy` leads with `--schema`, not with plugins.

## Consequences for the roadmap

1. **Lead with `--schema`.** Six issues over nine years, unanswered, with help-scraping as
   the workaround. It is the most evidenced gap in either tracker.
2. **E4 (the explicit lifecycle) is worth more than it looks.** yargs #1069 is the
   second-most-wanted open item in either project and is 8.5 years old.
3. **Help rendering (H1–H6) is the largest cluster and the #1 single request.** Ten years
   unbuilt. It is also, conveniently, a projection of the manifest we already build.
4. **The parser correctness list is finite** and should be a checklist in
   `replacement-parser`, each item citing its upstream issue.
5. **Reposition plugins** from headline to compounding advantage.
