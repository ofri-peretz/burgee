---
'seniority': minor
'burgee': minor
---

`seniority`'s cosmiconfig drop-in now reads YAML the way cosmiconfig does. `.yaml`, `.yml` and extensionless rc files go through `seniority/yaml`, the package's own parser, which is loaded the first time a YAML file is read and never before. The loader used to read only the JSON subset of YAML and throw a `LoaderError` (`no YAML parser for <file>`) for the rest. It now returns what `js-yaml` 5 returns. A malformed file throws cosmiconfig's own message, `YAML Error in <file>:` followed by the reason and `(line:column)`. cosmiconfig 10.0.1's own suite grades `seniority` at 240 / 243, up from 186 / 243, level with the control's 240 / 243.

`burgee migrate` now rewrites `cosmiconfig` to `seniority`, because the row is level. A file that imports a name `seniority` does not export, such as the type `LoaderSync`, is refused as `unknown-export` and stays on cosmiconfig. On Linux, the global config directory is still resolved from the home directory rather than from `XDG_CONFIG_HOME` (D-20260930-seniority-yaml).
