---
id: A-20261020-default-completer-at-parent
section: A
status: open
source: default-command R4 (D-20261020-default-command-design-accepted)
done_when: '`prog --port <TAB>` at a level whose default declares `port` with a `complete` function prints that completer''s values through `__complete`, with a case in `completions-dynamic.test.ts` proven red first'
---

default-command R4 makes every level with a default offer the default's options in the four
shell scripts and the Fig spec, because those options are typed there. An option of the default
that declares a `complete` function is offered too, and the script calls the program back for it
as `prog __complete --port <partial>`, the path being the level's and not the default's.

`completeDynamic` (`packages/burgee/src/complete-dynamic.ts`) looks the option up on the node the
path resolves to, which is the level, so it finds nothing and prints nothing. The value is not
wrong, it is absent: TAB offers no values for that option at the parent, and offers them as before
after the default's own name.

The fix is one lookup: the level's options, then its default's (`run-default.ts`). It is not in
the default-command PR because `complete-dynamic.ts` is the `completion-context` lane's file
while that intent is in flight, and wave 3's rule is one lane in a file at a time.
