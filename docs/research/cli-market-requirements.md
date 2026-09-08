# What production CLIs actually ship

Ten CLIs studied 2026-09-07 — six by downloading published tarballs and binaries, four from
published docs plus upstream source, with `gh` observed live. Versions pinned:
`@posthog/cli` 0.18.1, `oxlint` 1.82.0, `vite` 8.2.2, `vitest` 5.0.0, `wrangler` 4.129.1,
`vercel` 59.11.7, `gh` 2.97.0, `aws-cli` 2.25.1, `trivy` and `semgrep` at head.

## The matrix

`Y` yes · `~` partial · `N` no

| CLI | Machine output | Self-describing | Distinct exit codes | Completions | Precedence documented | SARIF |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| posthog-cli | `~` per-cmd | **Y** `api search/info/schema` | N | N | **Y** full chain | N |
| oxlint | **Y** 10 formats | `~` | **N** — 20 variants → 0/1 | N | N | **Y** 2.1.0 |
| **vite** | **N** — zero `--json` | N | N | N | N | N |
| vitest | **Y** 13 reporters | `~` | `~` +130 | **Y** 4, **dynamic** | N | N |
| wrangler | `~` 4 spellings | `~` | N | `~` 2, static | `~` | N |
| vercel | `~` undocumented | N | N | N | `~` | N |
| **gh** | **Y** `--json`+`--jq` | **Y** field discovery | **Y** 0/1/2/**4=auth** | **Y** 4 | `~` | N |
| **aws v2** | **Y** 5 + `--query` | **Y** skeleton | **Y** 0/1/2/130/**252/253/254** | **Y** 4 + auto-prompt | **Y** 6 layers | N |
| trivy | **Y** 6 + `convert` | N | `~` **collides** | **Y** 4 | **Y** | **Y** synthesised |
| semgrep | **Y** 7 | **Y** `show` ×15 | **Y** 0/1/2/4/7/8 | **N** | N | **Y** pass-through |

**vite is the honest counter-example**: enormously successful, with essentially none of
this. Its consumer is a human and its output is a build directory. Worth remembering
before we treat the floor as universal — it is a floor for CLIs whose callers are programs.

## Table stakes

1. **A machine-readable mode — 8/10.** But spelled five different ways, and wrangler alone
   has *four* descriptions of the same boolean because each command declared it separately.
   **One spelling, global, framework-owned.**
2. **Non-interactive mode — 10/10.** Universal. Must be a framework primitive that knows
   which commands prompt, not a flag each author remembers.
3. **`NO_COLOR` — 9/10.** Settled standard, free to implement, conspicuous when missing.
4. **Config + env — 10/10 have it, 3/10 document the precedence.** The widest gap in the
   survey between what CLIs do and what they say, and it is pure framework territory: if
   burgee owns resolution it can *generate* the precedence table and a `config explain`.
5. **Distinct exit codes — 5/10.** oxlint is the cautionary tale: a 20-variant internal
   `CliRunResult` enum collapsed to `{0,1}`, so a config typo and a real finding are
   indistinguishable to CI. **The taxonomy must be declarative, not left to the author.**
6. **Completions — 5/10.** Prefer vitest's and cobra's *dynamic* protocol, where the shell
   calls back into the binary, over static templates that drift.
7. **Telemetry with a real off switch — 6/10**, and the good ones share three properties: a
   command, an env var, and a **local inspection mode**.

## The ideas worth stealing

### 1. Vercel's action-required envelope — the most transferable finding in the survey

When a prompt *would* have blocked, vercel emits not an error but a recovery plan:

```json
{ "status": "error", "reason": "link_required", "message": "…",
  "next": [{ "command": "vercel global-config list", "when": "List Global Config stores in the current team scope" }],
  "hint": "Run one of the commands in next[] to complete without prompting." }
```

`enrichActionRequiredWithInvokingCommand` rewrites `next[]` to carry the caller's own global
flags forward, so the suggested command is directly runnable. **Nothing else in the set does
this** — everything else hangs, or prints prose a human must read.

And it is *framework-shaped*: burgee knows the command tree and the current argv, so it can
synthesise `next[]` automatically rather than making every author hand-write it. This is a
strictly better version of our E3 `fix` field.

### 2. Agent detection, because `isTTY` is no longer sufficient

`@vercel/detect-agent` covers **13 agents** — cursor, claude, devin, replit, gemini, codex,
opencode, github-copilot, v0 and more — probing `AI_AGENT`, `CLAUDECODE`, `CURSOR_AGENT`,
`CODEX_THREAD_ID`, `GEMINI_CLI` and others. Non-interactive becomes the **default** under an
agent, with `FORCE_TTY=1` to override.

**This is a hole in our floor.** O2 and P2 both key off `isTTY`, and an agent may well have
one. `AI_AGENT` is the generic escape hatch and is becoming a de-facto standard.

### 3. Token-budget-aware introspection (posthog, alone)

`posthog-cli api schema <tool> [field_path]` returns the full JSON Schema under a
`TOKEN_CHAR_LIMIT = 4 * 12e3` budget — 48,000 chars, about 12k tokens — and falls back to a
progressively summarised schema above it, with field-path drilling to go deeper.

Nobody else treats *the consumer has a context window* as a design constraint. For a
framework whose CLIs are driven by agents, `--schema` should do this by construction.

### 4. Field discovery as the schema mechanism (gh, alone)

Omitting `--json`'s argument lists every valid field; an invalid one prints the valid set.
No schema subcommand, no separate docs, no drift, and the error teaches the correct usage.

### 5. A dedicated agent *format* that is not JSON (oxlint and vitest, independently)

oxlint's `agent` reporter: *"one line per diagnostic, no source excerpts, no summary"*,
rendering `{file}:{line}:{col}: {severity} {rule}: {message} help: {help}` with whitespace
collapsed. **Deliberately not JSON.**

Two projects converged on this independently, which makes it an emerging norm rather than a
one-off — and it contradicts the assumption that agents always want JSON. Agents want
*low-token and grep-able*, which is frequently neither the human format nor JSON.

### 6. The three-way error class (aws, alone at this fidelity)

`252` you typed it wrong · `253` your environment is wrong · `254` the remote said no.
Each implies a different response: fix the script, fix the runner, retry or escalate. With
gh's `4 = authentication required` — the most actionable single code in the survey — this is
a strictly richer taxonomy than our E1.

### 7. Scan once, render many (`trivy convert`)

A first-class root command that re-renders the canonical JSON into SARIF, CycloneDX, JUnit
or HTML. For expensive commands this is the difference between one CI run and four.

## The security market has different, harder rules

A distinct segment where these are non-negotiable.

**SARIF 2.1.0 is the entry ticket** — and note it is leaking out of security into general
static analysis, since oxlint emits it too. Required concretely: the version string, the
OASIS schema URL in the document, per-rule `properties.tags`, `precision`, and
**`security-severity`**.

The two scanners **disagree** on that last one, and it is a decision we must make explicitly:

- **trivy synthesises it always** — CRITICAL 9.5 / HIGH 8.0 / MEDIUM 5.5 / LOW 2.0,
  overridden by real CVSS v3 when available.
- **semgrep passes it through** — emitted only if the rule author supplied it, so custom
  rules produce SARIF that GitHub Code Scanning renders *without severity*.

Trivy is right for a framework default: **always emit, derive from declared severity, let a
finding override.** Silent degradation is exactly what compliance workflows cannot absorb.

### The market's biggest unsolved problem, and our opening

**"Findings present" is not distinguishable from "the tool failed."**

Trivy exits `0` by default even with critical findings; `--exit-code N` opts in. But tool
failure hardcodes `1` through `log.Fatal` → `os.Exit(1)`. So the near-universal CI
incantation `--exit-code 1` makes *"critical CVE found"* and *"the vulnerability database
failed to download"* the same signal — a transient network failure reads as a clean scan
with findings, or a findings gate reads as broken infrastructure. Either way the wrong
person is paged.

[Discussion #7915](https://github.com/aquasecurity/trivy/discussions/7915) raises exactly
this; the maintainer disputes it; it is unresolved. The workaround is `--exit-code 2`, and
trivy's own docs do not say so.

Semgrep gets it right by construction: `2` the tool broke, `4`/`7`/`8` your rules or config
are wrong, `1` it ran and found things.

**Two more conflations worth fixing:** `--severity` (which findings to *show*) and the gate
(which findings should *fail the build*) are different questions, and both scanners conflate
them — trivy's own docs recommend running the scanner twice as the workaround. And output
schema stability needs a written contract; trivy's `SchemaVersion` policy is the model,
semgrep publishes none.

**Telemetry is a compliance blocker**, and both have traps: trivy's `--disable-telemetry`
still contacts `check.trivy.dev` unless you *also* pass `--skip-version-check`; semgrep's
`--metrics` defaults to `auto`, which means **on in essentially every real CI**, and it
transmits config hashes, rule hashes and the hashes of rules that produced findings.

## What could not be determined

Stated rather than guessed: posthog's telemetry and update-check behaviour; oxlint's
telemetry (the npm package wraps a Rust binary not obtained); wrangler's update check;
vercel and posthog completions (cannot prove a negative from a minified bundle);
gh's env-vs-config precedence; whether non-Homebrew aws distributions behave identically.

One correction for future work: **`aws/aws-cli@develop` is v1** and omits 252/253/254
entirely. The v2 branch is the citation.
