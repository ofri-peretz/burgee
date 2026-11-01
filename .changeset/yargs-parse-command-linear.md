---
"burgee": patch
---

`burgee/yargs` reads a command string with a long run of dots about 3x faster, and its cost now
grows in proportion to the string. Before, two things made it grow faster than the input on large
strings. Parse-command stored its bracket map in a plain array filled from the last index down,
which V8 holds as a sparse dictionary. It also rebuilt each dot run one character at a time. Past
a million characters, each doubling of the input cost 2.1–2.5x. The map is now a typed array, and
the bracket strip splits the string at its brackets. `cmd x` followed by 5,120,000 dots went from
461 ms to 134 ms, and each doubling now costs 1.99–2.04x. Every command string parses to the same
result as before. That is checked against yargs' own regexes over every short string of the
characters that matter, and yargs' suite still passes 816 of 816. `burgee/yargs` grows by 69 B
bundled and is still lighter than yargs (0.987×).
