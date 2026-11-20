---
"oxmutate": minor
---

`container` mode installs what a real project needs. The install gets the host's `~/.npmrc` (or
`$npm_config_userconfig`) and `~/.yarnrc.yml`, and each variable they name, while the tests see none
of it (`registryAuth`, off by default with a remote `host`), and `installEnv` is `env` for the install
alone. oxmutate need not be a dependency of the project: unless `command` is set, the container
installs the host's own version. `include` sends files git ignores that the tests need, such as
`.env.test`. Yarn 2 and later installs with `--immutable`, and a bun lockfile asks for
`container.image` and `container.install` instead of falling back to npm.
