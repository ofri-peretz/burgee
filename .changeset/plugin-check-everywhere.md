---
'bellpull': minor
'burgee': minor
'caique': minor
'closeout': minor
'linegauge': minor
'paratext': minor
'roundel': minor
'seniority': minor
---

Every plugin host has a `check` command.

```bash
npx linegauge check ./my-widths.mjs
npx burgee check ./my-plugin.mjs --json
```

PRINCIPLES 7 asks three things of an extension surface: the plugin is data validated against one
published schema, there is a **`check` command that shows it every way it can be seen**, and the
bar is measured. The first was built in all nine hosts; the second existed in `flagstaff` alone.
So an author writing a plugin for any other host found out what it did by shipping it into a
program — and a surface nobody can check is a surface nobody outside this repository can write
against.

Each command validates, registers, and shows what the host does with the plugin, in the host's own
terms: linegauge measures each code point **before and after** the override, paratext shows a
capability's `encode` **and** its `fallback`, roundel each token and what it replaced, caique each
widget's static projection rendered with its own sample. burgee's returns a **document** rather
than printing one, so `burgee check --json` is the form an agent that just wrote a plugin reads.

They share one contract with the author, held identically across all nine:

- a readable report, contribution by contribution, with **`ok` as the last line**;
- a refusal with a code from the family's vocabulary and a `fix`, exit 1;
- **`E_NO_CONTRIBUTION`** for a plugin that contributes nothing to this host — the schema allows
  unknown keys so one object registers everywhere, which makes a misspelled key silent, and this
  is how that typo tells on itself;
- exit 2 with no file.

Each host also gains an eval case measuring the one-turn claim, proved to discriminate before it
was committed: green against a correct plugin, red against the same plugin with one field broken.
