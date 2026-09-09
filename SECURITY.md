# Security policy

## Reporting a vulnerability

Please report privately through
[GitHub's private vulnerability reporting](https://github.com/ofri-peretz/burgee/security/advisories/new)
rather than opening a public issue. Include the affected package and version, the Node
version, and the smallest program that demonstrates the problem.

You will get an acknowledgement, and a fix or an explanation of why it is not one. If a
report turns out to be a real vulnerability, the advisory credits you unless you ask
otherwise.

## Supported versions

Every published package is pre-1.0 and only the latest release of each is supported. There
are no long-term support branches yet; when a 1.0 exists, this section will say what it
promises.

## What reduces the attack surface here

- **Zero runtime dependencies** in every published package: the supply chain a caller
  inherits from burgee is burgee.
- **`node:util.parseArgs`** does the parsing, rather than a hand-rolled tokeniser.
- **CodeQL** runs on every push, and `secure-coding` and `node-security` lint rules run at
  `error` on every file — those rules caught a prototype-pollution vector in our own option
  parsing during development.
- **Dependabot** watches the development dependencies, which are the only dependencies.
