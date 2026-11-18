---
id: A-20261118-extractor-findings-channel
section: A
status: closed
source: 'lane ac-extract, 2026-11-18 (PR #1630): Extractor.run returns a document only'
done_when: 'host.ts lets an extractor return { document, findings }, as a generator may return { files, findings }; run-extract reports the findings; and, after that lands on main, the extract lane drops its x-findings stopgap'
---

**An extractor has nowhere to put what it could not express.** `Extractor.run` returns a document,
so the extract lane writes its findings into the document under `x-findings`, a stopgap that leaks
into the user's spec. Generators already return `{ files, findings }` (since PLAN.md step 6.0); extractors need the same
shape. The spine lane owns `host.ts` and `run-extract.ts`; the extract lane removes the stopgap after.

**Closed 2026-11-18** on `integrate/extractor-findings`, one cross-lane change: `host.ts` gains
`ExtractorResult` and `documentOf`, `run-extract.ts` reports the findings as `gen` does (text and
`--json`), and the extractors return `{ document, findings }` with the `x-findings` stopgap removed.
