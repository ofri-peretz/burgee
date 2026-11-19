---
"oxmutate": minor
---

`container` runs with the host a black box: nothing of the host is mounted (the source goes in and
the reports come out through `<engine> cp`), so the engine may be remote (`host`, `context`) or
Podman. `source: 'git'` has the container fetch `HEAD`'s commit, so the host reads no project file.
New keys: `context`, `host`, `source`, `remote`, `ephemeral`, `runtime`, `readOnly`, `user`,
`platform`, `pull`, `pidsLimit` and `runArgs`. The oxmutate inside no longer receives the container
flags, so it may be an older version.
