---
'caique': patch
'burgee': patch
---

`caique/inquirer` follows `@inquirer/core` 12.1.1 (47 / 47, level with the control):

- Ctrl+D on a terminal rejects a pending prompt with `ExitPromptError('User force closed the prompt with EOF')`. A pipe that drains still leaves the prompt to settle on its own.
- State an effect sets while a keypress re-renders is painted one microtask later, before the next input, so a search prompt shows `loading` instead of staying idle.
- A prompt line of wide characters that fills the terminal exactly puts the cursor on the next row, measured in columns rather than code units.

`burgee migrate` names 12.1.1 as the `@inquirer/core` release graded level.
