---
id: A-20261124-oxmutate-paren-html-comment-regex
section: A
status: open
source: 'burgee#1782, 2026-11-24: the mutation lane could not load triggerlist tests after oxmutate rewrote brief.ts'
done_when: 'oxmutate instruments a source file holding a regex literal that opens with `<!--` (for example /<!-- x -->/u) and the rewritten copy transforms under vite 8 and rolldown 1.2; a fixture test in packages/oxmutate holds it'
---

**A parenthesised regex that opens with `<!--` breaks the mutation lane.** oxc's parser, as
rolldown 1.2.14 and vite 8.3.4 ship it, rejects `(/<!-- a/u)` with "HTML comments are not allowed
in modules", in `.js`, `.ts` and `.tsx` alike, with or without a space or newline after the `(`.
The same regex parses as a call argument (`f(/<!-- a/u)`), after a comma (`(void 0, /<!-- a/u)`),
in an array, or bare. Node parses all of them. oxmutate wraps each mutated regex in parentheses,
so a source file that is valid on its own fails to load once instrumented, and every test that
imports it drops out of the dry run.

triggerlist's `brief.ts` hit it and was changed to write the delimiters as escapes
(`\u003C!--` and `--\u003E`). The fix belongs in two places: oxmutate's emitter, which can write such a branch as
`(void 0, /re/)`, and an upstream report to oxc with the four-line reproduction above.
