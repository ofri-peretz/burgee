---
"oxmutate": minor
---

`container`: run oxmutate inside a container it starts, isolated from the host. `container: true`
takes every default, a string names the image, and the full form sets the engine (docker, podman),
image, install, setup, volume, cpus, memory, env and extra `run` arguments. The repository's git
files are copied into a named volume that keeps its own `node_modules` between runs; the reports
and the incremental file are copied back. `--container`, `--container-image` and `--no-container`
set it from the command line.
