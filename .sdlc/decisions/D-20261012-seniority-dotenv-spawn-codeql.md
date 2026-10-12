---
id: D-20261012-seniority-dotenv-spawn-codeql
subject: 'CodeQL alerts #106, #107 and #108 (`js/shell-command-constructed-from-input`, error) sit in `spawnCommand`''s Windows path in `packages/seniority/src/dotenv-spawn.ts`, which `seniority/dotenv/cli` uses to start the user''s command through cmd.exe. The owner wants the escaping provably right and the alerts resolved in code, preferably by calling bellpull''s graded cross-spawn instead of a second copy. What does seniority do?'
taken: Taken
date: '2026-10-12'
superseded_by: —
---

**seniority keeps its own escaping and does not depend on bellpull. The escaping is now proven against a model of every reader between `spawnCommand` and the program, is run through the real cmd.exe on the Windows lanes, and refuses the three inputs no escaping can carry. With that refusal in place, CodeQL 2.27.2 reports none of the three alerts.** Two of the refused inputs were live holes in the line dotenv 18 builds. A line break let a following `&` run as a command. A `%name:…%` expanded a variable into the line.

**Why not bellpull's cross-spawn.** The layering allows the edge: seniority and bellpull are both leaves, so seniority → bellpull makes no cycle. The behaviour rules it out, in three ways:

- **Batch files.** cross-spawn escapes twice only for a `node_modules/.bin/*.cmd` shim. dotenv 18's suite (`Windows resolves executables and batch shims with spaces in their paths`) also runs a `plain.cmd` and a `probe.bat` outside `.bin` with `a"quote` and then `a&b`. Escaped once, the quote throws the batch file's second read of `%*` out of step, and the `&` is live there. `dotenv-spawn-cmd.test.ts` pins this: cross-spawn's line through a batch file reads `live: ['&']`. Changing bellpull to escape every batch file twice would change the behaviour that its cross-spawn grade measures. Delegating as it stands would lower dotenv's Windows grade. Both are ruled out.
- **cross-spawn's quoting is wrong for two or more backslashes before a quote.** Its PR #160 regex, `/(?=(\\+?)?)\1"/`, captures one backslash of a run, because the lazy group sits inside an atomic lookahead. So `a\\"b` comes back as `a\\b` and `a\\" b` as two arguments. bellpull's scan (`escape.ts`) gets this right, as `quoteWindowsArgument` does. So the honest comparison is with the algorithm, not with cross-spawn's bytes. Over 2,048 vectors the bytes are identical wherever no such run exists, 1,900+ of them (asserted). Where one exists, only our side reads back as written. bellpull's comment saying the two "produce the same bytes" is wrong for these inputs. bellpull's output is the correct one.
- **Cost.** seniority's description, keywords and README say *Zero dependencies*, which `dependency-claim-lock` holds. An edge for one Windows path of one subpath would end that claim for every consumer of `seniority`.

**What changed in `dotenv-spawn.ts`.**

1. `isCmdEscapeSafe(value)`: no CR, LF or NUL. A line break ends cmd's command line. Escaping it with a caret makes a continuation that escapes the *next* character instead, so `"\n&calc"` became `^<LF>^&calc` and left the `&` live. NUL ends the string. No escaping carries them, and Rust's std refuses them for batch files for the same reason (CVE-2024-24576). `protectShellToken` checks this on entry and throws a `TypeError`. `dotenv run` reports it as `dotenv: …` with exit 1 before anything starts.
2. `:` is now careted. cmd's percent pass reads `%name:…%` as `name` plus a modifier. With `:` bare, `^%PATH:C=^&calc^%` names `PATH`, which is set, so its value lands raw in the line. cross-spawn and dotenv 18 both leave `:` bare. With it careted, every `%…%` span cmd can see names a variable ending in `^`, because every `%` and every `:` is preceded by a caret.
3. `spawnCommand` refuses an environment that has a variable name ending in `^`. That closes the last way (2) could expand anything. `.env` keys cannot contain `^` (dotenv's grammar is `[\w.-]+`), so only a parent environment that sets one can trigger the refusal.

**The proof** (`packages/seniority/src/dotenv-spawn-cmd.test.ts`). It has three readers: cmd's percent pass (with `:` modifiers), its caret-and-quote tokenizer (run again on what a batch file's `%*` forwards), and the C runtime's argv rules. A line counts as right when it has no live operator, no expansion, and gives back the caller's argv exactly. The vectors held to that are:

- dotenv 18.0.7's two Windows argument sets;
- cross-spawn's `should handle arguments with shell special chars`, its #82 cases and its shim case;
- `%CD%`, `%PATH:C=&calc%`, `%PATH:~0,5%`, `%=C:%`, `!name!`, `^caret`, tabs, UNC paths and non-ASCII;
- 3,000 seeded random argument lists, for a plain command and for a batch file.

A test pins the model against the attacks it exists to catch, so the model can fail. On `windows-latest` the same vectors, plus three canaries that a live `&` or an expansion would trip, go through the real cmd.exe into an npm shim found on `Path`, the shim by path, a `.bat` and a `.cmd`.

**CodeQL, stated exactly.** `js/shell-command-constructed-from-input` takes `run(argv, proc)`'s parameters as library input. In 2.27.2 its barriers are its own sanitizer classes, the `BarrierGuard` classes, and `TaintTracking::AdHocWhitelistCheckSanitizer`. It reads no models-as-data barrier; only `js/command-line-injection` does. So no `.github/codeql/` model could have cleared it, and none was added. What clears it is the guard at the escaper's entry: `if (!isCmdEscapeSafe(token)) throw`. CodeQL counts a one-argument check whose name contains "safe" as an allowlist guard. That is a naming rule. **CodeQL does not verify the escaping, and nothing here claims it does. The test above is the proof.** The barrier is narrow. It covers only values that went through `protectShellToken`. Measured locally (CodeQL 2.27.2, the repo's config): main 3 alerts; this change 0; this change with the guard renamed 5; this change with an argument pushed without `protectShellToken` 2. The full default suite over seniority and bellpull reports 0. Nothing was dismissed.

**Budgets.** `shape.test.ts`'s R9 ceiling was raised 140,000 → 140,600 B: main stood at 139,784 B and this change adds 539 B, the refusals and their reporting. The weight band was re-measured by `npm run weight:converge` (231,237 → 232,706 B installed). `./dotenv/cli` stays inside its 29,800 B budget. A few hundred bytes are worth it to close a live operator and an expansion on the one path that hands a user's command to a shell.

**Grades** (Node 24.13.0, Linux). With `--control`: dotenv 191 / 191 and cross-spawn 68 / 68. Targets: `seniority/dotenv` 191 / 191 (dotenv 18.0.7, re-vendored in #1067; 179 / 179 at 18.0.5) and `bellpull/cross-spawn` 68 / 68. One Windows-only dotenv case is skipped on Linux on both sides. Nothing was lowered.
