---
'seniority': minor
---

New entry, `seniority/yaml`: a YAML parser with no dependency. `parse(text)` returns what `js-yaml` 5's `load` returns for the part of YAML a configuration file is written in — block and flow mappings and sequences, plain, quoted and block scalars, comments, document markers, anchors and aliases, and the core schema (`null`, booleans, integers, floats, strings, and the `!!str` / `!!int` / … tags). Malformed input throws a `YAMLException` with js-yaml's reason and its 1-based `(line:column)`. Every expectation in its tests is also checked against js-yaml on every run. Nothing else in the package imports it, so a program that reads no YAML carries none of it. Pass it to `discover` as a loader to read YAML config files: `loaders: { '.yaml': (_path, text) => parse(text) }` with `extensions` naming `.yaml` (D-20260930-seniority-yaml).
