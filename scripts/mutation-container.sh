#!/bin/sh
# The changed-lines lane's two steps inside oxmutate's container (`laneContainer` in scripts/mutation.ts),
# so the host builds nothing for it and starts no mutant: the Sophos/Kandji agents see one disk image.
#
#   install  the sync step, with the network, run when package-lock.json or Cargo.lock changed: the
#            install, a Rust toolchain (once per machine, in the shared `burgee-mutation-rust` volume)
#            and the native crate's dependencies.
#   setup    the run step, without the network, before every package run: each package's build
#            (turbo, its cache in the volume) and oxmutate's native core (cargo, its target dir in the
#            shared volume, so a new worktree does not rebuild oxc).
#
# Bash-free (the image's sh is dash).
set -eu
cd /w/src
case "$1" in
install)
  npm ci --no-audit --no-fund
  if [ ! -x "$CARGO_HOME/bin/cargo" ]; then
    # ponytail: two worktrees installing the toolchain at the same moment race once per machine; rerun the push.
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --no-modify-path
  fi
  cargo fetch --manifest-path packages/oxmutate/native/Cargo.toml
  ;;
setup)
  # The sync sends files, not .git. Without a repository turbo walks the tree itself and stops at a
  # tracked symlink loop (compat-oracle's vendored find-up fixture); with a HEAD it hashes from git, as
  # on the host. Committed once, with plumbing (the install's `prepare` put lefthook in this scratch
  # repository): later syncs show up to turbo as changes against it.
  if ! git rev-parse -q --verify HEAD >/dev/null 2>&1; then
    git init -q && git add -A
    git update-ref HEAD "$(git -c user.name=lane -c user.email=lane@localhost commit-tree "$(git write-tree)" -m synced)"
  fi
  TURBO_TELEMETRY_DISABLED=1 npx turbo run build --filter='./packages/*' --cache-dir=/w/turbo-cache --output-logs=errors-only
  # One build-and-copy at a time across worktrees: the target dir is shared, and the copy must be this source's.
  flock /rust/build.lock sh -c 'cd packages/oxmutate && npm run build:native'
  ;;
*)
  echo "usage: mutation-container.sh install|setup" >&2
  exit 2
  ;;
esac
