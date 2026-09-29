---
"seniority": patch
---

`seniority/cosmiconfig` now matches cosmiconfig 10.0.1 in three places where it did not.

- `stopDir: ''` searches the start directory alone, as upstream's truthiness check does. Before, an empty `stopDir` switched the search to `global` and walked up to the working directory and then into the global config directory.
- `packageProp` walks a path the way upstream does. A path through a string reads the string's own properties, so `'name.length'` is a number. A path through a `null`, such as `"foo": null` under `packageProp: 'foo.bar'`, throws the `TypeError` upstream throws, annotated with the file. Before, both answered "not found", and the search moved on to the next file.
- A start directory that cannot be `stat`ed for any reason but absence rejects the search with the `stat` error, as upstream's `isDirectory` does. Before, every such failure read as "no config here". Which paths fail that way is the platform's call: on Linux and macOS, `search('<file>/sub')` rejects with `ENOTDIR` and a directory the process may not enter with `EACCES`; Windows reports `<file>\sub` as not found, so there it is still "no config here", as it is upstream.

`loadJson` no longer wraps a non-`Error` in an `Error`, because `JSON.parse` of a string throws nothing else.
