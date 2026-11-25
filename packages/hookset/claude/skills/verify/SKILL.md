---
name: verify
description: Boot this repo's app or CLI, drive the change the way a user would, and check what it shows. Use before every commit that changes behaviour, and as the smoke test after a fix.
---

# Verify a change by running it

Tests say the parts work; this skill says the feature works. Run it before committing a change that
a user could notice, and paste what you saw (the command and its output, or the screenshot) into
the commit's `Verified-by:` receipt or the PR's "How this was checked".

TODO(verify): replace every TODO(verify) line with this repo's real steps, then delete this one.
`hookset check` fails while any TODO(verify) remains.

## Boot

TODO(verify): the one command that builds and starts the thing a user runs (a dev server, the CLI
from its built bin, a local service), how to tell it is ready, and how long that takes.

## Drive and inspect

TODO(verify): how to exercise it as a user: the browser tool and URL for a site, the CLI command
with real arguments, the request for a service. What to read back: the page text, the exit code
and output, the response body.

## Feature map

The features a user sees, each with where to reach it and what "working" looks like. A change
re-runs the rows it touches; a release runs them all.

| Feature      | Reach it by  | Working means |
| ------------ | ------------ | ------------- |
| TODO(verify) | TODO(verify) | TODO(verify)  |

## When it fails

Fix the code, not this skill. If the skill itself is wrong (a step that no longer boots), fix the
skill in its own commit and say so. After three failed rounds, stop and show the person the output.
