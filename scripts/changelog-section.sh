#!/usr/bin/env bash
# Prints one version's section of a changesets CHANGELOG.md — the body under `## <version>`,
# up to the next `## ` heading — for `gh release create --notes-file`.
#
#   scripts/changelog-section.sh <CHANGELOG.md> <version>
#
# `release.yml` used to hand the whole file to `--notes-file`, so every GitHub Release carried
# the package's entire history and `burgee@0.9.0`'s page opened on 0.9.0 and scrolled on to 0.1.0.
# Prints nothing (exit 0) when the version has no section; the caller falls back to
# `--generate-notes`. A `## ` line inside a fenced code block is content, not a heading.
set -euo pipefail
file=$1
version=$2
[ -f "$file" ] || exit 0
awk -v heading="## $version" '
  /^[[:space:]]*(```|~~~)/ { fence = !fence }
  !fence && $0 == heading { found = 1; next }
  !fence && found && /^## / { exit }
  found { lines[++n] = $0 }
  END {
    s = 1; while (s <= n && lines[s] ~ /^[[:space:]]*$/) s++
    e = n; while (e >= s && lines[e] ~ /^[[:space:]]*$/) e--
    for (i = s; i <= e; i++) print lines[i]
  }
' "$file"
