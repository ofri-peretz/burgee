---
'burgee': minor
---

Every boolean option accepts `--no-<name>`. burgee's precedence is `flag > env > config file > package.json field > default`, and the config and package.json layers set options by name — so any boolean can arrive `true` without the user typing anything, while a boolean flag carries no value and `--x=false` is refused. Before this the top layer of that chain could only ever say `true`, and a boolean turned on in a config file could not be turned off from the command line at all. `--x` and `--no-x` together: the later one wins. String options are unaffected, and `--no-config` still means "load none".
