---
"flagstaff": patch
---

Three fixes.

- **A plugin key named like an `Object.prototype` member is checked like any other.** The schema walker read `properties.toString` and `properties.constructor` off the prototype, as a schema that admits anything, so `{ name: 'x', toString: 1 }` passed an object that allows no other keys. A required key is now present only when the object has it, or inherits it from a prototype of its own (a component written as a class still keeps `static` there) — `{}` no longer satisfies `required: ['constructor']`.
- **`markdown` reads a line that opens with a code span as a paragraph, not a fence.** ```` ```x``` is code ```` opened a code block that swallowed the rest of the reply. A backtick fence's info string holds no backtick (CommonMark), so it is now a paragraph with the code span drawn; a tilde fence still takes any info string.
- **`markdown` drops a heading's closing run of `#`s when it draws it.** `# Title #` was drawn as `Title #`; it is now `Title`, as CommonMark has it. A `#` with text against it (`# C#`, `# a #b`) is still text.
