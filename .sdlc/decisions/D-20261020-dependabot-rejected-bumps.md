---
id: D-20261020-dependabot-rejected-bumps
subject: 'Dependabot keeps proposing bumps we already declined twice: ignore those exact versions, or keep closing them by hand?'
taken: 'Taken — by the batch-21 agent under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-20'
date: '2026-10-20'
superseded_by: —
---

**Ignore the five declined releases by exact version in `.github/dependabot.yml`, not the
dependencies themselves.** #1148 dropped them from its group with evidence. #1181 dropped them
again for the same reasons and added no ignore ("they come back as their own batch"). #1205 then
proposed exactly that set a third time, and nothing else. Each round costs a CI run of the full
matrix plus a hand-trimmed lock, and the result is a PR with nothing left in it. An exact-version
ignore stops the repeats, and Dependabot still proposes the first release after each one, so a
fixed release reaches us without anyone remembering to look.

| bump | why it was declined | evidence | revisit when |
| :-- | :-- | :-- | :-- |
| `react` / `react-dom` 19.3.0 → **19.3.1** | `benchmarks/package.json` declares react, and controlroom's W1–W4 rows weigh and time the ink drop-in with react on both sides. A grouped bump moves those measurements without anyone re-recording them. | #1148 `c18fdf4bd8` | Dependabot proposes 19.3.2 or later, or someone bumps react on purpose in a PR that re-records W1–W4 |
| `js-yaml` 5.4.3 → **5.5.0** | seniority's `yaml.test.ts` `REFUSALS` pins js-yaml's own error text, `the stream contains non-printable characters (1:5)` for `a: \u0007`. 5.5.0 "reports the exact position of non-printable characters" (its changelog, js-yaml #801), so that case fails. | #1148 `c18fdf4bd8` | a PR re-grades seniority's YAML refusals against 5.5 and takes its positions, or 5.5.1+ is proposed |
| `next` 16.3.8 → **16.4.2** | `next build` in the docs apps took the runner down ("received a shutdown signal") on two runs in #1148, and Unit Tests (Turbo) died the same way in #1181. 16.3.8 builds the same apps. 16.4.0 is already ignored for the same failure mode (#1088). | #1148 `268eb9f470`, #1181 | 16.4.3+ is proposed: Dependabot will open it, and it lands only if the Build lane survives |
| `fumadocs-core` / `fumadocs-ui` 16.17.1 → **16.17.5** | `fumadocs-mdx`'s peer keeps 16.17.1 at the root, so the lock carries two copies, and `apps/docs` fails to prerender `/` with "You need to wrap your application inside FrameworkProvider" | #1148 `9951e718cb` | fumadocs-mdx's peer range admits 16.17.5+, so one copy resolves. Dependabot proposes the next release once it exists |

**Why not ignore the whole dependency.** None of these is a vendored host or a B4 incumbent with
a graded suite. Those are ignored by name in this file, because only a re-vendor may move them.
These are ordinary dependencies that one particular release broke. Ignoring them by name would
also hide the release that fixes the problem.

**What this does not hold back.** These are exact versions, so any later release still shows up as
a normal grouped bump. The review bot on #1181 says next 16.4.1 fixed three advisories (not checked here). The docs apps
stay on 16.3.8 regardless, so this ignore changes nothing about that. If an advisory lands
against 16.3.8, the OSV gate fails, and the fix is a deliberate next bump with the build lane
repaired, not this entry.

**Done with it.** #1205 is closed and links here.
