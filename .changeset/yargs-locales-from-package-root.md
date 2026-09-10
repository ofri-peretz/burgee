---
'burgee': patch
---

`burgee/yargs` finds its locale table from the package root rather than from the depth of
one file. It resolved `../locales` relative to itself, which was correct only while that file
sat directly in `dist/`; the moment it moved into a directory the path became `dist/locales`,
y18n returned the key for every string, and 14 of yargs' own 804 tests failed. Walking up to
`package.json` resolves the same from `src/`, from `dist/`, and from an installed
`node_modules/burgee/dist/`.
