---
"seniority": patch
---

The cosmiconfig drop-in's `global` search now ends in the directory cosmiconfig uses. That directory comes from `env-paths`: `$XDG_CONFIG_HOME/<name>` on Linux, falling back to `~/.config/<name>` when the variable is unset or empty, `%APPDATA%\<name>\Config` on Windows, and `~/Library/Preferences/<name>` on macOS. Before this fix, the drop-in built the directory from the home directory alone. A Linux user with a non-default `XDG_CONFIG_HOME` who moved to `seniority` with `burgee migrate` silently lost their global config. The environment is read when the search runs, through the package's one runtime seam, and only when `globalConfigDir` is not passed. On Linux, cosmiconfig 10.0.1's own suite now grades `seniority` at 242 / 243, the same as cosmiconfig itself (D-20260930-seniority-xdg-config-home).
