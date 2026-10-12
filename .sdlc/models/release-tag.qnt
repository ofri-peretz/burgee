// -*- mode: Bluespec; -*-
/**
 * The tag a release leaves behind (.github/workflows/release.yml, the publish loop):
 *
 *   git push origin "$tag_name" || echo "(tag already on remote)"
 *   gh release create "$tag_name" …                 # burgee: no --target
 *
 * `gh release create` makes the tag itself when the remote has none — from `--target`, which
 * defaults to the default branch's head. burgee now passes `--target "$(git rev-parse HEAD)"`
 * (eslint passes `--target "$GITHUB_SHA"`); `pinned` chooses which shape a trace models, and
 * `unpinnedHolds` is the counterexample that motivated it — kept, expected to be violated.
 */
module releaseTag {
  var pinned: bool       // --target "$GITHUB_SHA"
  var mainHead: int      // commits keep landing on main while the job runs
  var published: int     // the SHA whose dist went to npm; 0 = not yet
  var localTag: bool
  var remoteTag: int     // the SHA the remote tag points at; 0 = none
  var released: bool

  action init = all {
    nondet p = Set(true, false).oneOf() pinned' = p,
    mainHead' = 1, published' = 0, localTag' = false, remoteTag' = 0, released' = false,
  }
  action unchangedBut = true

  /** A merge lands on main mid-job. */
  action mergeToMain = all {
    mainHead' = mainHead + 1, mainHead < 4,
    pinned' = pinned, published' = published, localTag' = localTag, remoteTag' = remoteTag, released' = released,
  }
  /** The job checked out `published`'s SHA = GITHUB_SHA = 1. */
  action publish = all {
    published == 0, published' = 1,
    pinned' = pinned, mainHead' = mainHead, localTag' = localTag, remoteTag' = remoteTag, released' = released,
  }
  action tag = all {
    published != 0, not(localTag), localTag' = true,
    pinned' = pinned, mainHead' = mainHead, published' = published, remoteTag' = remoteTag, released' = released,
  }
  /** `git push origin "$tag_name"` succeeds… */
  action pushOk = all {
    localTag, remoteTag == 0, remoteTag' = published,
    pinned' = pinned, mainHead' = mainHead, published' = published, localTag' = localTag, released' = released,
  }
  /** …or fails, and `|| echo` swallows it. Then the release step runs. */
  action releaseCreate = all {
    localTag, not(released), released' = true,
    remoteTag' = if (remoteTag != 0) remoteTag else if (pinned) published else mainHead,
    pinned' = pinned, mainHead' = mainHead, published' = published, localTag' = localTag,
  }
  action idle = all {
    released,
    pinned' = pinned, mainHead' = mainHead, published' = published, localTag' = localTag, remoteTag' = remoteTag, released' = released,
  }

  action step = any { mergeToMain, publish, tag, pushOk, releaseCreate, idle }

  /** `name@version` points at the commit that built what npm serves. */
  val tagIsPublished = remoteTag != 0 implies remoteTag == published

  /** eslint's shape holds it. */
  val safety = pinned implies tagIsPublished
  /** burgee's shape: expected to be VIOLATED — a lost tag push plus a merge mid-job. */
  val unpinnedHolds = not(pinned) implies tagIsPublished
}
