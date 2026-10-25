---
"burgee": patch
---

`burgee check` reads a `.json` plugin file as data. The example locale pack is JSON, and checking
it threw Node's ERR_IMPORT_ATTRIBUTE_MISSING (`import()` of a JSON file needs
`with: { type: 'json' }`), so an author checking the example as shipped got a runtime error instead
of a report. A byte-order mark an editor saved is dropped before parsing.
