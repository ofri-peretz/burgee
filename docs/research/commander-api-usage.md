# What commander users actually call

Measured 2026-09-07 against the published tarballs of five large CLIs that depend on
commander: `webpack-cli`, `firebase-tools`, `@vue/cli`, `lerna`, `@angular/cli`. Counts
are call sites across their shipped JavaScript.

The point: `burgee/commander` has 151 methods to reach, and "follow everything they are
using" is a claim about the ones people actually call, not the whole surface. This is the
build order for wave 2.

| Method | Call sites | In burgee today |
| :--- | ---: | :--- |
| `.option()` | 416 | ✅ |
| `.description()` | 239 | ✅ |
| `.parse()` | 234 | ❌ **highest-value gap** |
| `.action()` | 220 | ✅ |
| `.error()` | 204 | ❌ — but see the caveat |
| `.command()` | 37 | ✅ |
| `.help()` | 26 | ❌ |
| `.options` | 16 | ❌ (property, read for introspection) |
| `.name()` | 16 | ✅ |
| `.outputHelp()` | 9 | ❌ |
| `.alias()` | 9 | ❌ |
| `.usage()` | 7 | ❌ |
| `.addOption()` | 7 | ❌ |
| `.allowUnknownOption()` | 6 | ❌ |
| `.version()` | 5 | ❌ |
| `.aliases()` | 5 | ❌ |
| `.parseAsync()` | 3 | ❌ |
| `.opts()` | 2 | ❌ |
| `.helpInformation()` | 2 | ❌ |
| `.requiredOption()` | 1 | ✅ |
| `.exitOverride()`, `.configureOutput()`, `.configureHelp()`, `.helpOption()`, `.showSuggestionAfterError()`, `.allowExcessArguments()` | 1 each | ❌ |

**Caveat, stated because it matters.** These are text matches on method names, so `.error(`,
`.help(`, `.name(` and `.action(` collect calls that are not commander's — `console.error`
alone plausibly accounts for most of the 204. Treat the tail as ordering evidence and the
head as a shape: a handful of methods carry almost every program.

## What this says

**The distribution is extremely head-heavy.** Six methods — `option`, `description`,
`parse`, `action`, `command`, `name` — cover the overwhelming majority of call sites, and
burgee already implements five of them. The 151-method surface is real, but the *reachable*
surface for a typical program is closer to fifteen.

**The highest-value gap is `.parse()` / `.parseAsync()`.** burgee's façade builds the
manifest correctly but does not yet execute from it, so a real program cannot run. Nothing
else on this list matters until that does.

**Then the help family** — `.help()`, `.outputHelp()`, `.helpInformation()`, `.usage()`,
`.version()`. Together 49 call sites, and they are the surfaces H1–H6 render from the
manifest anyway, so they are close to free once the renderer exists.

**Then identity and shape** — `.alias()`, `.aliases()`, `.addOption()`,
`.allowUnknownOption()`, `.opts()`. 39 call sites, all straightforward manifest operations.

**The configuration hooks are rare but load-bearing** — `.exitOverride()`,
`.configureOutput()`, `.configureHelp()` appear once each here, but they are exactly what
test harnesses and embedders use, so a CLI that uses one cannot migrate without it.

## Build order for wave 2

1. `.parse()` / `.parseAsync()` — execute the manifest. Nothing runs without it.
2. `.version()`, `.help()`, `.outputHelp()`, `.helpInformation()`, `.usage()` — the help
   family, rendered from the manifest.
3. `.alias()`, `.aliases()`, `.addOption()`, `.opts()`, `.optsWithGlobals()`,
   `.allowUnknownOption()`, `.allowExcessArguments()`.
4. `.exitOverride()`, `.configureOutput()`, `.configureHelp()` — rare, but they gate
   embedders and test harnesses.
5. Everything else, driven by the compat oracle's failing tests rather than by this list —
   at that point the burn-down is a better guide than any sample of five programs.

Re-measure at the start of wave 2 against a wider sample; five CLIs is enough to order the
work and not enough to close it.
