---
'benchmarks': patch
---

B4 publishes a second bundle ratio: ours against the incumbent **plus what a user of it installs
to reach the same capability set**.

`burgee` is 27,552 bundled bytes and `cac` is 10,457, so the bare row reads 2.636 — a true
number that stays on the page, and not the choice anybody makes. A program that picks `cac` and
then wants its config file read, its shutdown bounded on every path out and its cursor handed
back on Ctrl-C installs three more packages.

| | the incumbent alone | + what you add to match burgee | ours | ratio |
| :--- | ---: | ---: | ---: | ---: |
| `cac` | 10,457 B | 97,711 B | 27,552 B | **0.282** |
| `commander` | 39,085 B | 126,354 B | 59,156 B | **0.468** |
| `yargs` | 111,110 B | 198,269 B | 105,240 B | **0.531** |

The stack is bundled as one program, so a module two additions share is paid for once — which
is what a real bundler does, and what summing three separate measurements would get wrong.

**The rule that stops this being a rigged denominator:** a package may enter a stack only where
this repository publishes a *graded drop-in* for it — a `compat-oracle` row whose pass rate
comes from that package's own suite. `parity.test.ts` fails if an addition names a package with
no active row, which is checked rather than promised. Capabilities with nothing to add against
(`--schema`, `--mcp`, the `{ ok, data }` envelope, agent detection, option relations) are listed
and priced at **zero**.

Reported, never gated: a ceiling here would be a ceiling on somebody else's dependency tree.
Three new claims settle against it, and the three bare rows keep their own verdicts unchanged.
