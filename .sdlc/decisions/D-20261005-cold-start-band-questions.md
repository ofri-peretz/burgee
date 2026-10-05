---
id: D-20261005-cold-start-band-questions
subject: 'control-band-cold-start-ratio: where its two standing questions are answered'
taken: Taken
date: '2026-10-05'
superseded_by: —
---

**Both are answered by a bisect over `benchmarks/results/`, not in the intent**, as D-065
settled for the B4 bands. Which commit first left the band is that bisect's output. Whether
the excursion is a regression or noise is its second output: a commit that steps the
paired-spawn median is a regression; a window with no step is the 1σ rule firing on a
timing ratio whose σ is 0.0198, and then the band, not the code, is what this intent
changes, deliberately and with its reason.

The intent stays `draft`, owned by the watcher. This decision only stops it carrying
questions that `decisions-lock.test.ts` counts against a ceiling of zero.
