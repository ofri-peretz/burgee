---
"oxmutate": minor
---

oxmutate 0.1: mutation testing for JavaScript and TypeScript on the oxc engine. It reads `stryker.config.*` unchanged, runs your tests warm inside your own Vitest, and writes Stryker's JSON report, HTML and SARIF. All 17 of Stryker 10.0.0's mutator families, verdicts that agree with Stryker's on 99.9% of mutants across the subjects measured, CI lanes (`--since`, `--shard`, `--incremental`, `--frozen-oracle`), `survivors --json` and `--mcp` for agents, a command runner, a type checker on survivors, ignore rules as data, and spec oracles that replay Quint traces against each mutant. The native core ships inside the package for macOS (arm64, x64), Linux (gnu x64/arm64, musl x64) and Windows (x64).
