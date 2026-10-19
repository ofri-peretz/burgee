---
"bellpull": patch
"burgee": patch
"caique": patch
"closeout": patch
"controlroom": patch
"flagstaff": patch
"linegauge": patch
"paratext": patch
"roundel": patch
"seniority": patch
---

Every drop-in subpath now type-checks under `moduleResolution: node10`, and under `module: commonjs`
with no resolution set, which is TypeScript's default there. `import … from 'burgee/commander'`
used to fail with TS2307 in such a project, although `require()` of the same specifier worked.
Each package now declares `types` and a `typesVersions` map, derived from `exports`, with one key per
typed subpath pointing at the file `exports` already names. `exports` is unchanged, so `node16`,
`nodenext` and `bundler` read exactly what they read before. `controlroom/ink`'s declarations no
longer name the untyped `react-reconciler`, which was TS7016 for consumers with `skipLibCheck: false`.
