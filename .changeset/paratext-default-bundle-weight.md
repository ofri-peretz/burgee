---
"paratext": patch
---

The root's default export bundles lighter than `ansi-escapes`' now: 4,287 B against 4,351 B (0.985×), down from 7,038 B (1.618×), with `esbuild --bundle --minify` over a program that imports the default alone. Importing the root still registers the same seven built-ins, and the API is unchanged. They go into the registry without the schema walk `register` runs, because they are constants a test holds to zero schema problems, so a bundle of the default no longer carries the walk. The default object also lists its members by name instead of spreading a module namespace, which bundlers kept as a getter object. `ansi-escapes`' own suite still passes 4 / 4.
