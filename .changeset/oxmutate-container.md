---
"oxmutate": minor
---

`container`: run the mutation testing of any repository inside containers oxmutate starts,
isolated from the host. `container: true` takes every default, a string names the image, and the
full form sets the engine (docker, podman), image, network, install, setup, volume, cpus, memory,
env, extra `run` arguments and the command. The repository's git files are synced into a named
volume that keeps its own `node_modules` between runs; the run has no network by default; every
container drops all capabilities and is labelled `dev.oxmutate`. The reports and the incremental
file come back to the host. `--container`, `--container-image` and `--no-container` set it per run.
