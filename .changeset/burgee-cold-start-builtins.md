---
"burgee": patch
---
A run starts faster: the engine reads `parseArgs` and the `fs` calls behind `--version` and config discovery through `process.getBuiltinModule` instead of an ES `import` of `node:util` and `node:fs`. An ES import builds a namespace over every export and loads 24 Node internals to do it (`worker_threads`, `fs/promises`, `readline`), none of which a run calls. Measured over 300 interleaved spawns, the paired CPU ratio against cac fell from 1.590 to 1.517. No behaviour changes: the calls and the objects they are made on are the same.
