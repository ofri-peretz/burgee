# What 230 issues say about the output stack

Snapshot taken 2026-09-08 with `scripts/fetch-competitor-issues.sh stack`. Raw JSON in
[`issues/output-stack/`](./issues/output-stack/). Every claim below cites an issue number
so it can be re-read. Companion to [what 329 open issues say about the CLI space](./competitor-open-issues.md),
which covers the parser layer; this document covers what a CLI *shows*.

Four of the ten trackers are empty because the maintainer closes by policy, not because
nothing is wanted. For those four, every issue closed in the last three years was read
as well, and the ones closed as *not planned*, *wontfix*, locked as resolved with a
decline, or closed in a sweep with no fix are cited below as **declined**. A declined
issue in a 440M-a-week package is the clearest statement available of a gap nobody else
will close.

| Repo | Open | Closed (3y) read | Declined | Read |
| :--- | ---: | ---: | ---: | :--- |
| chalk/chalk | 0 | 32 | 20 | all, plus closing comments |
| alexeyraspopov/picocolors | 8 | — | — | all |
| sindresorhus/ora | 0 | 34 | 17 | all, plus closing comments |
| sindresorhus/log-update | 0 | 11 | 3 | all, plus closing comments |
| sindresorhus/boxen | 5 | — | — | all |
| cli-table/cli-table3 | 13 | — | — | all |
| SBoudrias/Inquirer.js | 8 | — | — | all; 38 discussions as summaries |
| bombshell-dev/clack | 60 | — | — | all (re-read; 0 discussions) |
| vadimdemedes/ink | 14 | — | — | all; 46 discussions as summaries |
| listr2/listr2 | 0 | 45 | 8 | all, plus closing comments |
| **total** | **108** | **122** | **48** | |

"Declined" is: `state_reason: not_planned`, a `wontfix` label, a lock with a maintainer's
no, or a closing comment that says out of scope, not our bug, or stale — the honest
count, not the mechanical one. Two things the snapshot corrects in the research
intent's premise: chalk's 2026-07-25 sweep was a *release*, not a policy close (v6.0.0
shipped undercurl, exact `FORCE_COLOR` levels and ansi256 downsampling the next day), and
listr2 does not close by policy at all — its 45 closures are 37 fixes with a
semantic-release bot comment and 8 honest declines.

The one-line finding: **the trackers are not about colour, spinners or tables. They are
about the terminal being a shared resource that every package claims for itself** —
who decides whether it is a TTY, who owns stdin, who may write while something animates,
what happens when the frame is taller than the screen, and what a program reading the
output sees. Those are one layer's problems, and no incumbent is that layer.

---

## 1. One decision about the terminal, and everyone makes a different one

Every package detects colour and interactivity on its own, and the detections disagree.

- **picocolors #100** (2026-02) `FORCE_COLOR=0` *enables* colours: the check is
  `!!env.FORCE_COLOR`, and `"0"` is truthy — "CI environments and tools like Homebrew set
  `FORCE_COLOR=0` to get parseable plain text output, and this breaks after migration"
  from chalk. **chalk #624** (2024-02, fixed only in v6.0.0, 2026-07) `FORCE_COLOR`
  worked as level 0 or 3 and nothing between. **picocolors #85** (2024-10, 7 reactions)
  use Node's own `tty.WriteStream.hasColors()` instead of a private heuristic.
- **cli-table3 #357** (2026-05) the published 0.6.5 emits ANSI under `NO_COLOR=1` while
  the README documents behaviour that only exists on `master`. **listr2 #687** (2023-09)
  `disableColor` ignored; resolved by telling the user to set `NO_COLOR`. **cli-table3
  #180** (2020) no colours under Jenkins.
- **clack #286** (2025-04, 5 reactions) render decisions keyed on `isCI` when they should
  be keyed on `isTTY`. **ora #218** (2023) a Worker is "not interactive", so ora silently
  prints `- text` instead; **ora #235** (declined: "probably the command was piped and
  that doesn't work with interactivity"). **listr2 #716** (2026-07): piping stdout makes
  it non-TTY, so the default renderer steps down to `simple` — the maintainer's recipe is
  `forceTTY: true` plus routing the UI to stderr to keep stdout clean for the pipe.
- **chalk #614** (declined, 2023-09): apply a style conditionally — "no chance this would
  be in scope for the project as it's highly project-specific."
- **ink D#577** colours missing under Deno; **chalk v5.5/v5.6** added Ghostty and WezTerm
  to a truecolor allow-list — detection by emulator name, which is the approach U2 refuses.

Reading: the stack needs one `outputMode(runtime)` that every component reads and none
recomputes, with `NO_COLOR` / `FORCE_COLOR` semantics from the spec and a per-stream
answer (UI on stderr, data on stdout, as listr2 #716 ends up recommending by hand).
**Owner: U2, `roundel/policy`.**

## 2. Live redraws captured verbatim: pipes, CI, screen readers, agents

The newest and best-argued issues across the ten repos are all the same issue.

- **clack #585** (2026-07) *rfc: accessible mode*: spinners and live-redrawn prompts are
  re-announced on every repaint by VoiceOver/NVDA/Orca; GitHub's CLI hit the same wall
  and shipped static text plus numbered inputs; detecting screen readers is not viable
  over ssh, so an explicit `ACCESSIBLE` opt-in. **ink D#734** (2025-07) Gemini CLI, built
  on Ink, "seeing issues with compatibility with screen readers". The two largest terminal
  UIs of the moment have the same gap.
- **clack #510** (2026-04) `taskLog` accumulates every `\r` frame of a child's spinner
  as a separate line. An agent reading captured stdout has exactly this problem.
- **clack #533** (2026-05, 9 comments) *Resumable prompts for agent environments*:
  "The CLI usually hangs forever and just fails." **Inquirer D#1699** (2025-03) expose a
  CLI binary per prompt so a shell script can drive it; **Inquirer D#1356** an option to
  not re-render so each answer stays one line.
- **Inquirer #1783** (2025-07, 8 comments) `select` renders only the first choice under
  PowerShell and Git Bash; arrow keys work blind. **ora #116** (2019, 9 reactions, closed
  2025-09 without an answer) two spinners at once — the second overwrites the first.
  Both are what a component without a static form does when the live form fails.
- **log-update #59** (declined, 2025-09): `console.table()` support — "`log-update` only
  updates output it printed … use a table renderer that returns a string." That is the
  design rule stated by the incumbent: a component is a function to a string.
- **listr2 #732** (closed stale, 2025-07) events for an outside consumer: "it is not very
  feasible to listen for these events from the outside." The task list has state; nothing
  can read it except the renderer.

Reading: every animated or styled thing has a static projection — what it is when
nothing moves — and that projection is what a pipe, CI, accessible mode and `--json` get.
Refuse a component without one at registration. **Owner: U3; `caique` for the prompt
half (constraint 3), `flagstaff` for the render half (constraint 2).**

## 3. Writing while something animates

The single most-wanted feature across the four sindresorhus repos, open since 2017.

- **ora #120** (2019, **21 reactions**) *Output while spinning* — added in v9.1.0
  (2026-02). **ora #49** (2017, 5 reactions) log after starting a spinner: closed 2026-01
  with the `clear(); frame(); console.log()` workaround. **ora #90** (2018, 4 reactions,
  locked) ora swallows stdout written just before `.stop()` — "I can't write tests for
  stdout because they're gone." **ora #79** how to combine with log-update; **ora #232**
  reuse the spinner's line.
- **log-update #48** (declined 2025-09, 2 reactions) remember one line and update it while
  logging continues below — "beyond log-update's intended scope and design philosophy."
  **log-update #60** keep `debug` on a different stream than the live frame.
- **Inquirer D#1662** print to stdout while a prompt is active "without causing some weird
  rendering"; **listr2 #698** pin an output line ("not possible … if further requests come
  in"); **#703 / #744 / #686** per-task output regions, their height, multiline; **clack
  #304** merge `log` and `stream`.

Reading: the frame loop owns the stream. There is one live region and one log region;
writing to the log region persists a line above the live one and repaints. No component
gets its own write path. **Owner: `flagstaff` (the frame loop).**

## 4. Frames taller or wider than the terminal, and the flicker in between

- **log-update #51** (2021, 5 reactions, closed 2025-09 without comment) opt out of "fit
  lines to terminal height"; a commenter's explanation — scrollback is the emulator's,
  not the terminal's, so lines above the top cannot be rewritten — is the constraint every
  incumbent rediscovers. **ora #121** garbage lines once the spinner exceeds console
  height. **listr2 #720** (2 reactions): with long lists "the first items scroll out of
  view"; a windowing policy "was evaluated and not adopted for v11, so that remains a
  known limitation." **listr2 #744** the output bar breaks above terminal rows.
- **ink #973** (2026-06) a `<Static>` commit taller than the viewport overwrites its own
  last line: the incremental path ignores static-chunk height and log-update's relative
  cursor math desynchronises. **ink #942** (2026-05) after a shrink-then-grow resize the
  scrollback stays squished; wants a full-repaint API. **clack #132** spinner message
  repeated infinitely when the terminal is narrower than the message.
- Flicker: **ora #226** (4 reactions) and **#221** blink in some terminals, closed as the
  terminal's problem; **ink D#715** (3 upvotes) synchronized-output escape sequences
  solve it on Ghostty; **ink D#657** (6 upvotes) the 30 fps cap; **ink #773** (4
  reactions) a frame renders before `useLayoutEffect` completes. **log-update #31**
  partial updates (2 reactions) — shipped as v8's differential rendering, which listr2
  #720 credits for its own flicker fix.

Reading: the loop clips to `rows`, wraps to `columns`, re-measures on resize, diffs
frames, and may wrap a repaint in synchronized-output markers. These are properties of one
loop, not of each component. **Owner: `flagstaff` (frame loop design); a hypothesis until
the PTY tests exist.**

## 5. Measuring strings: ANSI, hyperlinks, CJK, emoji

- **boxen #90** (2023, 7 comments) the border is wrong when the content is coloured.
  **cli-table3 #322** a hyperlink with `!` in it breaks the table; **#356** `string-width`
  resolves to an object under NestJS, so the width function is not a function.
- **clack #556** long labels wrap and columns stop lining up; **#306** newlines break the
  `|` gutter; **#116** (2023, **7 reactions**, oldest open clack bug) multiselect
  misrenders options of two or more lines. **listr2 #708** (4 reactions) inquirer wraps
  too early inside listr2's fake writable, which had no `columns`; fixed by reporting
  `Infinity`. **listr2 #768** the default renderer strips ANSI from `task.title`.
- **ink D#716** the letter 𝑓 measured wrong; **chalk #625** (declined) an emoji font
  ignores the colour — "Chalk (and any other color library) cannot color emojis."

Reading: one width function, ANSI- and hyperlink-aware, shared by box, table, prompt and
spinner. Node 24 strips VT sequences natively but does not know East Asian width; whether
the stack ships its own table or accepts the imprecision is a measured decision.
**Owner: `flagstaff` (a `width` module in `design.md`); hypothesis — measure against
`string-width` before lock.**

## 6. Stdin, raw mode and Ctrl+C

- **ora #156** (2020, **13 reactions**) Ctrl+C does nothing while a spinner runs; closed
  2026-02 as "not so much an issue with Ora as it is with JavaScript being single-threaded".
  **ora #253** (2026-04) and **#248** (2026-01) Ctrl+C dead, a pre-commit hook that never
  completes — both fixed in `stdin-discarder`, a dependency, "just reinstall Ora". **ora
  #209 / #194** stdin left paused, discard not working; **#236 / #234 / #233** `.stop()`
  breaks `readline`, v8 breaks prompts, v8 does not release.
- **clack #573** (2026-06) Ctrl+C on a spinner skips `onCancel`; **#408** `block()` leaves
  stdin in raw mode on Windows so SIGINT never fires. **listr2 #709** SIGINT listener added
  and never removed; **#769** task cancellation on Ctrl+C. **ink #978** (2026-07) native
  memory grows unbounded on repeated `setRawMode()` toggles across mount/unmount.

Reading: exactly one owner of stdin per process, raw mode entered and left by the same
code path, cancellation as a value (`CANCELLED`), and a spinner that never touches stdin
at all. **Owner: `caique` (P2, constraint on `Ctrl+C`), with `flagstaff`'s spinner
forbidden from stdin by construction.**

## 7. More than one live thing: groups, subtasks, two spinners

- **ora #116** (9 reactions) two spinners at once; **ora #89 / #180** (declined) update
  or stop a spinner from another module or child process — "Ora instances are
  per-process." **listr2 #697** "since it takes control of the stdout, there can only be
  one instance running at a given time."
- **clack #152** (reopened) grouped spinners with a parent and sub-tasks; **#336**
  (3 reactions, Storybook's CLI) multi-level task log; **#502** subtask indentation.
  **listr2 #721** (wontfix) report a task as failed without throwing — states are
  exceptions in listr2, so a known failure and a crash look the same; **#751** empty
  `errors` when `exitOnError: false`.

Reading: one loop hosts many components, so two spinners is a list of two tasks, and a
task's states — ok, failed, skipped — are data it declares, not exceptions it throws.
One level of subtasks is the common case. **Owner: `flagstaff` (task list, one level
deep). Deeper trees are not planned, on purpose: that is listr2's surface, and
`cli-output-stack` records a listr2 façade as its own intent if an adopter asks.**

## 8. Prompts inside task lists, spinners inside prompts

- **listr2 #676** inquirer support — shipped as an adapter package; **#749** prompts in
  subtasks fail when the parent prompted; **#727 / #728** prompts under the manager;
  **#771** the adapter's peer range and listr2's version drifting apart on `pnpm install`;
  **#708** the adapter's fake stream has no `columns`. **ora #234** ora 8 breaks the
  prompt library beneath it.

Reading: five issues in one tracker are the cost of integrating prompts and tasks through
adapters over foreign streams. When the prompt and the task list share one loop and one
policy, the adapter does not exist. **Owner: `cli-output-stack` ("integration is
whole-stack") and `caique` (its spinner comes from `flagstaff`).**

## 9. Theme, glyphs and colours as data

- **chalk #666** (declined 2026-02) semantic theming: "chalk's API surface area is
  intentionally minimal, so this isn't something we'll want to add … building abstractions
  over Chalk is relatively simple and straightforward, and that's what we encourage."
  **#677** custom colour presets (duplicate); **#659** dynamic colour names, answered
  with a helper to write yourself.
- **clack #36** (2023, 5 reactions) themes, variants, icons; **#345** expose the style
  (symbols and colours) of every prompt without exposing rendering; **#379** global
  settings for `CommonOptions`; **#111 / #135** a description or help line under the
  question; **#551** a footer under select lists.
- **ora #255** make `logSymbols` optional — closed *not planned*, then shipped in v9.4.0
  the next day; **#240** change the default icons ("use `stopAndPersist()` with your
  own"). **boxen #106** subtitle, **#99** `titleColor`, **#94** `borderBackgroundColor`
  (with a patch attached). **cli-table3 #352** border colour by hex; **#305** a rule
  between header and body; **#328** several header rows; **#355** the characters for
  inner column splits. **Inquirer #1169** the separator between message and input;
  **D#1121** remove the instruction text. **ink D#641** (4 upvotes) box background.

Reading: every one of these is a token, a glyph or a colour someone wants to change
without forking. If plugins are objects — `tokens`, `glyphs`, `spinners`, `components` —
each of these is a key in a file, and chalk's "build it yourself" is a shape the stack
ships. **Owner: U4, `roundel/theme` for tokens, `flagstaff` for glyphs and component
options, `plugin-contract` for the one object.**

## 10. Validation belongs to the option, not the widget

- **clack #164** (2 reactions) `multiselect` has no `validate`; **#553** the built-in
  "select at least one" message is not customisable; **#397** `validate` runs on the empty
  input rather than the default; **#597** validators that throw exit the process.
  **Inquirer #1328** (8 comments) an input pattern that rejects keys as typed; **D#1471**
  the legacy `filter` is gone and there is no migration; **D#1295** a misspelled `name`
  key silently changes the answer's type.
- **clack #167** `mytool --template this` should pre-answer the prompt.

Reading: the question is the option. Its type, choices, default and validator are the
option's schema; the widget renders them and never owns them. **Owner: `caique`
(constraint 1) and `commander-schema` (`prompt: { message, kind }` on the option spec).**

## 11. Keys: ESC, numbers, vim, paste, IME

- **Inquirer #2179** ESC to clear then cancel; **clack #519** the same, "this is what fzf
  does"; **#407** return the partial input on cancel; **clack #475** number keys jump to an
  option; **#557** select-all and invert across grouped selects; **Inquirer D#1510** submit
  `y`/`n` without Enter. **Inquirer #1900** (14 comments) and **#1899** vim keybindings.
- **ink #759** (2025-08, **12 reactions**, from Gemini CLI) IME composition drops
  characters and lags for CJK input; **clack #142** the same left-shift under an input
  method. **ink #921** (sindresorhus, 2026-03) deprecate paste delivery through `useInput`;
  `usePaste` becomes the one paste API. **Inquirer D#1583** a multi-line paste truncates
  at the first line.

Reading: a widget's keymap is data with a small default; ESC-clears-then-cancels and
number keys are defaults. Bracketed paste and IME composition are stream-level concerns
the loop handles once. **Owner: `caique`. Vim mode is a plugin's `widgets` key (U4), not
a built-in. IME handling is a hypothesis until a PTY test with a composed CJK string
exists.**

## 12. Prompt widgets beyond the core set

- Go back: **clack #39** (2023, 5 reactions, 5 comments). Hooks: **#22** (11 comments).
  Cancellation as `AbortSignal`: **#83** (4 reactions, 9 comments, opened by the
  maintainer). History: **#225**. Dynamic message: **#187** (3 reactions).
- File and path pickers: **#32**, **#564 / #565**. Grouped autocomplete: **#524**
  (Changesets). `maxItems` on grouped multiselect: **#236**; `cursorAt`: **#193**;
  separators: **#555**; ordering and async sources in autocomplete: **#467**. Trees and
  flow diagrams as prompts: **#108 / #109**. A blinking cursor: **#120**.

Reading: the core set is text, confirm, select, multiselect, password, path and the
group; the façades decide what else exists, because clack's and inquirer's suites are the
gate (U11). **Owner: `caique`. Go-back is out of scope for v1 — decided 2026-09-06;
history and hooks are not planned, on purpose: an option-first prompt has no session and
its lifecycle is the command's.**

## 13. Both module systems

- **picocolors #70** (2024-06, **35 reactions**, the most-reacted open issue in the ten
  trackers) publish ESM — the only colour library still CJS-only; the proposal maintains
  two branches "to avoid having to ship a dual package (which would mean doubling the
  package size)". **#50** `export =` forces `allowSyntheticDefaultImports` on every
  consumer; **#59** the rollup TypeScript plugin cannot build it.
- **chalk #632, #633, #641, #628, #627, #620** — six requests for CommonJS in three years,
  every one declined: "We don't plan to do that", "This is not going to happen". **#613**
  chalk 5 under TypeScript CJS output; **#661** Jest; **#626** React Native cannot resolve
  `#ansi-styles` (the `imports` field). **ora #239** `ERR_REQUIRE_ESM`, declined; a user
  reports `--experimental-require-module` works with one `.default`. **listr2 #755** went
  ESM-only in 2026-01; **#745** type-only imports under `verbatimModuleSyntax`. **Inquirer
  D#1270 / D#1206** the same pair of errors from the other direction.

Reading: the two most-installed colour libraries refuse opposite halves of the same
request. `require(esm)` with a `default` condition serves both without a dual build.
**Owner: U10.**

## 14. The dependency tree is the bug

- **ora #229** (2023, 7 reactions, declined 2025-10) ora 7 segfaults CLIs built with
  `pkg`; reproduced across OSes, gone on ora 6; "probably not an Ora issue" — it was in the
  dependency tree. **ora #247** and **chalk #656** (2025-09, **80 reactions**, locked)
  the chalk 5.6.1 supply-chain compromise, which reached ora's users through
  `chalk → ora`. **chalk #685** (2026-07) staged publishing and provenance for a
  445M-a-week package with one publisher: "I will consider it, but it's not much of an
  improvement over using manual 2FA."
- **ink #976** (2026-07) the `ws` package is installed by every `ink` user for a
  DEV-only devtools probe that native `WebSocket` replaces. **#978** native memory leak
  in the layout engine's WASM. **listr2 #759** replace `eventemitter3` with Node's;
  **#724** `zen-observable`; **#707** `rxjs` in the public types but a dev dependency;
  **#726** segfaults that "resolved itself with underlying dependencies updated";
  **#771** a peer range mismatch between listr2 and its own adapter. **log-update #65**
  upgrade `wrap-ansi`; **cli-table3 #356** `string-width` interop; **#284** a dependabot
  workflow for one production dependency; **Inquirer D#1809** `external-editor` raised
  the Node floor under `@vue/cli`.

Reading: the incumbents' bugs are disproportionately in what they install, not what they
wrote. Zero external dependencies is a correctness property. **Owner: U6; the provenance
half is `security-profile`.**

## 15. Not our bug: bundlers, other runtimes, terminal emulators

Every maintainer in the ten trackers closes these the same way, and so does this repo.

- Bundlers and environments: **chalk #655** (Vite), **#615** (`navigator`), **#626**
  (React Native), **#638** (a reporter), **#661** (Jest), **#646**; **picocolors #97**
  `process` is not defined on Cloudflare; **log-update #63** (declined) importing it in
  a browser build throws at module load — "This package targets Node.js". **clack #508**
  bun's module mocking; **#202** (6 comments) a Deno package; **#200** (5 reactions) a Go
  port. **ink D#691** a single binary without a runtime.
- Emulators: **ora #146** (4 reactions, declined 2026-02) Windows forced to the `line`
  spinner — "the Windows Terminal team has explicitly said `WT_SESSION` is not an API and
  should not be used for feature detection". **chalk #621** italic in Git Bash; **ora
  #213** one machine; **#226 / #221** blink; **Inquirer #1783** mintty renders one row.

Reading: nothing in the stack reads `process.*` or sniffs an emulator; streams, env and
`isTTY` arrive through `Runtime` (T1), which is what makes the packages incidentally
portable and deliberately blind. **Owner: not planned, on purpose.** Reason: Node ≥ 24 is
the floor (roundel constraint 7, `cli-packaging`); the process-reference lock (T1,
`cli-testing-harness`) is the mechanism; emulator detection is refused by U2 — a stream
that misrenders live output gets the static projection (U3) through `pipe` or
`accessible` mode, never a per-emulator branch. Deno and bun are expected to work through
their Node compatibility and are not tested.

## 16. Layout engines, scrolling and full-screen

- **ora #231** (declined): a split two-page terminal view — "outside the scope of this
  package. Try Ink." **ink #765** (9 reactions, Gemini CLI, reopened) `overflow: scroll`
  with a virtual scrollbar; **#222** (2019, 9 reactions, 23 comments) scrolling; **D#490 /
  D#621 / D#668 / D#897** scroll regions, footers, the last line. **#676 / #660** (5
  reactions each) a multi-line editor with selection. **#870 / #251** a `<Cursor>`
  element. **D#555** swap yoga for Taffy; **D#959** a pure-TypeScript flex engine. **#834**
  (**14 reactions**) `create-ink-app` no longer works on current Node and the README
  should stop recommending it. **clack #84** a package for long-running dev-server UIs.

Reading: this is a real want and a different product. Ink's own backlog is the layout
engine's backlog: scrolling, cursor placement, resize repaint, WASM memory. **Owner: not
planned, on purpose — U8.** Reason: box, columns and a status line are the ceiling; the
day a plugin needs flexbox is a recorded decision. A long-running status line for `burgee
dev` is inside the ceiling and reaches `flagstaff` through U13.

## 17. Sequences and levels beyond `util.styleText`

- **picocolors #99** blink; **chalk #604** (2023, closed 2026-07) undercurl — shipped in
  chalk 6 as underline styles and colours. **chalk #686** ansi256 not downsampled at
  level 1; **#624** numeric `FORCE_COLOR` as an exact level — both fixed in 6.0.0.
  **#635** `chalk.keyword` differs from `chalk.red` — "Chalk no longer has a `.keyword()`
  method." **cli-table3 #322** OSC 8 hyperlinks inside cells.

Reading: `roundel/tokens` styles with `util.styleText` and offers nothing it does not
support; the chalk façade must reproduce chalk 6's `level` model to pass its suite, which
is the open question already recorded in the roundel intent. **Owner: `roundel`
(`./tokens`, `./chalk`), with `output-stack-compat` grading the level semantics.
Undercurl and hyperlinks are not planned in tokens; a hyperlink is a `flagstaff`
component if an adopter asks.**

## 18. Release hygiene: semver, types, notes, and a watch

- **ora #260** (declined 2026-06) a type widened in a patch broke consumers; the maintainer:
  "Fixing wrong types is routinely shipped as a patch." **#254** a separate types package;
  **#238** behaviour differs between Node 16 and 19. **Inquirer #841** (2019, 3 reactions)
  release notes carry no details. **listr2 #766 / #788** the automated release failing;
  **#730** a peer bump not released; **#752** each Node EOL is a new major. **cli-table3
  #357** the README documents an unreleased version. **chalk #619** (declined) a
  prototype-pollution fix for v4: "too risky to change such an old version."

Reading: façades pinned to a release and re-vendored weekly turn every one of these into a
scoreboard diff rather than a surprise. **Owner: `output-stack-compat` (the release
watch); packaging rules in `cli-packaging`.**

## 19. TypeScript

**cli-table3 #55 / #185** `push()` has no call signature, cross tables do not type-check;
**clack #234 / #131** `group` results infer `unknown`, **#178** option values, **#600**
(2026-09) `isCancel` no longer narrows after 1.5.0; **picocolors #92** only
`string | number | null | undefined` accepted; **listr2 #723** a wrong `ReturnType`;
**Inquirer D#1295 / D#1362** unexported config types. Reading: façade types are graded by
the incumbent's own type tests (U11), and the plugin object's types come from one schema
(U9). **Owner: U11 for façades, U9 for plugins.**

## 20. Performance: per-call cost and big tables

**chalk #669** (2.7× on a microbenchmark, 1.29× measured) and **#660** (locked as spam)
caching proposals; **cli-table3 #68** (2018, 7 comments) 1,763 rows take 4.4 s to
`toString()`; **listr2 #772** a heap exhaustion in the renderer; **ink D#983 / D#401**
React Compiler and refresh-rate questions. Reading: per-call throughput is a benchmark
row, and the import cost of each subpath is the floor. **Owner: `cli-benchmarks` (B4)
for throughput; U5 for import cost.**

## 21. Testing the output

**ora #90** (locked) "I can't write tests for stdout because they're gone"; **Inquirer
D#1979** how to test with `@inquirer/testing`; **ink D#776** an author records asciinema
so an agent can see the app; **clack #307** how to get colours under vitest; **#508**
mocking under bun. Reading: animated output must snapshot byte-for-byte with an injected
clock and injected streams. **Owner: `cli-testing-harness` (T1) and `flagstaff`
("deterministic under test").**

---

## What could not be determined

Recorded so the next pass knows where this one stopped.

- **Bodies longer than 2,200 characters were read to that length.** Nine issues exceed
  it: ink #978 (+22k), #765 (+4k), clack #336, #379, #533, #585, boxen #94, cli-table3
  #284, chalk #660. Their titles, first 2,200 characters and closing comments were read;
  the tail was not.
- **Comment threads were read as the last two comments per closed issue**, not in full.
  chalk #656 has 44 comments, listr2 #745 has 20, ora #90 has 11. The maintainer's decision
  is in the last comment in every case checked; earlier argument is not represented.
- **Discussions were read as title, category, votes and the first 400 characters**, for
  Inquirer (38) and ink (46) only. Discussions are disabled on the four sindresorhus repos
  and picocolors, cli-table3 and listr2; clack has them enabled with zero posts. The
  intent's open question — whether sindresorhus's discussions count as a tracker — is moot:
  they do not exist.
- **Why log-update #51 (5 reactions) and #31 were closed is not in the record**: both were
  closed on 2025-09-15 without a comment. #31 is assumed shipped (listr2 #720 credits
  log-update v8's differential rendering); #51 is assumed dropped. Neither is confirmed.
- **ora #116's closure is unexplained**: closed 2025-09-16 in a sweep; the final comment is
  a stranger's auto-reply. Whether two spinners is wanted or refused is not stated.
- **Whether the oldest open bugs still reproduce** — clack #116 (2023, 7 reactions) on
  1.8.0, cli-table3 #68 (2018) on 0.6.5 — was not tested.
- **Declined counts are a judgement**, stated in the table's caption. The mechanical count
  (`not_planned` only) is chalk 16, ora 12, log-update 3, listr2 0.
- **No rate limit was hit**: roughly 260 REST and GraphQL calls against a 5,000/hour
  budget. **No locked thread was unreadable**; locks affect commenting, not reading.
- **The REST `since` filter is by `updated_at`**, so the three-year window was applied on
  `closed_at` after fetching; an issue closed more than three years ago and never touched
  since is correctly excluded, and none closed inside the window can be missed.
- **Ink is not vendored and will not be**; its issues are cited only as evidence for U3 and
  U8, never as requirements the stack meets.

## Citations for the U floor

One row per requirement in `cli-output-stack/intent.md`. A row with no citation is marked
*hypothesis — measure before lock*, per the research intent.

| id | Requirement, in short | Issues that support it | Standing |
| :-- | :-- | :-- | :-- |
| U1 | One package per layer; arrows point up only | listr2 #771, #708, #676; ora #234 — the cost of layers coupled by adapters and peer ranges | partial: cited for the cost; the arrow direction is a decision, not a finding |
| U2 | One output policy from `Runtime` | picocolors #100, #85; chalk #624, #614; cli-table3 #357, #180; listr2 #687, #716; clack #286; ora #218, #235; ink D#577 | cited |
| U3 | Every output has a static projection | clack #585, #510, #533; ink D#734; Inquirer D#1356, D#1699, #1783; ora #116; log-update #59; listr2 #732, #716 | cited |
| U4 | Plugins are data | chalk #666 (declined), #677, #659; clack #36, #345, #379; ora #255, #240; boxen #106, #99, #94; cli-table3 #352, #355; ink D#641 | cited |
| U5 | Conditional weight per subpath | ink #976 (a DEV-only path installed for everyone); picocolors #70 ("doubling the package size"); chalk #617 (README is 25% of the tarball) | cited |
| U6 | Zero external runtime dependencies | ora #229, #247; chalk #656, #685; ink #976, #978; listr2 #759, #724, #707, #726, #771; log-update #65; cli-table3 #356 | cited |
| U7 | Own Z1 shape test and K5 ratchet per package | cli-table3 #357 (npm and `master` disagree), #356; ora #229 (an install shape that segfaults) | partial: the failure mode is cited; the ratchet itself is a repo rule |
| U8 | No layout engine | ora #231 (declined: "try Ink"); ink #765, #222, #676, #660, #870, #251, #834, #978, D#555, D#959 | cited |
| U9 | Agent-authorable plugin contract | clack #533, #525; Inquirer D#1699; ink D#776 — agents driving and inspecting CLIs | hypothesis — the one-turn eval is unmeasured; measure before lock |
| U10 | Both module systems, tree-shaken | picocolors #70 (35 reactions), #50, #59; chalk #632, #633, #641, #628, #627, #620, #613, #661, #626; ora #239; listr2 #755, #745; Inquirer D#1270, D#1206 | cited |
| U11 | Façades graded by the incumbent's suite | picocolors #100, #92 ("regressions when projects migrate from chalk"); listr2 #676; Inquirer D#1782, D#1471; clack #551, #553, #555, #556, #557 (one evaluator's clack-vs-enquirer-vs-inquirer gap list) | cited |
| U12 | Each layer an independent product | no issue; supported only by the download spread in the landscape table (chalk 440M/wk to ink 5.8M/wk, each chosen separately) | hypothesis — measure before lock |
| U13 | burgee's optional surfaces reach the family by guarded dynamic import | ink #976 (an optional path that costs every install); ora #229 (a spinner dependency taking the whole CLI down) | cited |
