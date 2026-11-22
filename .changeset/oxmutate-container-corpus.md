---
"oxmutate": patch
---

Container mode, found by running it on real repositories. The forwarded `~/.npmrc` is staged
world-readable (it is mode 0600, and the container has no capability to read another uid's file),
so an install behind a token no longer dies with `EACCES`. A symbolic link to a directory is sent
with the files. A run that failed no longer copies an earlier run's report back from the volume.
A project whose Vitest config asks for `pool: 'forks'` keeps it (tests that call `process.chdir`
need it). A dry run that ran nothing names what Vitest said, a Vitest older than 4.1 included; a
failing dry run quotes its first error and, in a container, names `container.network` for a test
that reached the network and `container.install` for tests that import build output the checkout
does not have; a failed install names the lockfile and the registry login.
