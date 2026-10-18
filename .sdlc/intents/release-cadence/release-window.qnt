// -*- mode: Bluespec; -*-
/**
 * The release window (release-cadence, `scripts/release-window.mts` and
 * `.github/workflows/changesets-pr.yml`), for one package.
 *
 *   - Changesets land on main: fixes (a `patch`, or a `Security:` summary) and features
 *     (`minor` / `major`).
 *   - Every push to main, and a daily schedule, refreshes the one Version PR from what is
 *     pending. The PR auto-merges; the merge starts a release, which reaches npm later.
 *   - The window: a feature may go into the PR only when the package's previous non-fix release
 *     is at least 7 days old.
 *
 * Two design choices, picked at `init` so one simulation walks both sides of each:
 *
 *   split          — a held feature is set aside and the rest of the PR (its fixes) still
 *                    merges. The alternative holds the whole Version PR: `unsplitHolds` is
 *                    expected to be VIOLATED, a fix that waits a week behind a feature.
 *   readsManifest  — "previous non-fix release" counts a non-fix release that is merged but not
 *                    yet on npm (main's manifest holds an `x.y.0` npm does not). Reading npm alone
 *                    lets a second feature through while the first is still publishing:
 *                    `npmOnlyHolds` is expected to be VIOLATED.
 *
 * `safety` is the shipped design: both choices taken, and neither guarantee broken.
 */
module releaseWindow {
  pure val WINDOW = 7
  pure val NEVER = -100
  pure val MAX_DAY = 40
  pure val MAX_PENDING = 2

  var split: bool
  var readsManifest: bool

  var day: int
  /** Changesets on main not yet in a merged Version PR. */
  var pendingFix: int
  var pendingFeat: int
  /** The open Version PR's contents, as of its last refresh. */
  var prOpen: bool
  var prFix: int
  var prFeat: int
  /** Merged, not yet on npm: one release run each. */
  var inflightNonFix: int
  var inflightFix: int
  /** What the registry says: the day of the newest non-fix release. */
  var npmLastNonFix: int
  /** Ghosts: what the guarantees are about. */
  var windowBroken: bool
  var fixDelayed: bool

  action init = all {
    nondet s = Set(true, false).oneOf()
    nondet m = Set(true, false).oneOf()
    all {
      split' = s, readsManifest' = m,
      day' = 0, pendingFix' = 0, pendingFeat' = 0,
      prOpen' = false, prFix' = 0, prFeat' = 0,
      inflightNonFix' = 0, inflightFix' = 0,
      npmLastNonFix' = NEVER,
      windowBroken' = false, fixDelayed' = false,
    },
  }

  /** A PR merges to main with a fix changeset. */
  action landFix = all {
    pendingFix < MAX_PENDING, pendingFix' = pendingFix + 1,
    split' = split, readsManifest' = readsManifest, day' = day, pendingFeat' = pendingFeat,
    prOpen' = prOpen, prFix' = prFix, prFeat' = prFeat, inflightNonFix' = inflightNonFix, inflightFix' = inflightFix,
    npmLastNonFix' = npmLastNonFix, windowBroken' = windowBroken, fixDelayed' = fixDelayed,
  }

  /** A PR merges to main with a feature changeset. */
  action landFeat = all {
    pendingFeat < MAX_PENDING, pendingFeat' = pendingFeat + 1,
    split' = split, readsManifest' = readsManifest, day' = day, pendingFix' = pendingFix,
    prOpen' = prOpen, prFix' = prFix, prFeat' = prFeat, inflightNonFix' = inflightNonFix, inflightFix' = inflightFix,
    npmLastNonFix' = npmLastNonFix, windowBroken' = windowBroken, fixDelayed' = fixDelayed,
  }

  /** The previous non-fix release as the refresh reads it. */
  val previous = if (readsManifest and inflightNonFix > 0) MAX_DAY + WINDOW else npmLastNonFix
  val windowOpen = day - previous >= WINDOW

  /**
   * `changesets-pr.yml`'s version job (a push, or the daily schedule): plan, then open or
   * refresh the Version PR from what may release now.
   */
  action refresh = {
    val featNow = if (windowOpen) pendingFeat else 0
    // The rejected design: any held feature holds the whole PR, fixes with it.
    val wholePrHeld = not(split) and pendingFeat > 0 and not(windowOpen)
    val fixNow = if (wholePrHeld) 0 else pendingFix
    val featIn = if (wholePrHeld) 0 else featNow
    all {
      prOpen' = (fixNow + featIn > 0), prFix' = fixNow, prFeat' = featIn,
      fixDelayed' = (fixDelayed or fixNow < pendingFix),
      split' = split, readsManifest' = readsManifest, day' = day, pendingFix' = pendingFix, pendingFeat' = pendingFeat,
      inflightNonFix' = inflightNonFix, inflightFix' = inflightFix, npmLastNonFix' = npmLastNonFix, windowBroken' = windowBroken,
    }
  }

  /** Auto-merge lands the Version PR: what it carried is now a release in flight. */
  action merge = all {
    prOpen,
    pendingFix' = pendingFix - prFix, pendingFeat' = pendingFeat - prFeat,
    inflightNonFix' = inflightNonFix + (if (prFeat > 0) 1 else 0),
    inflightFix' = inflightFix + (if (prFix > 0 and prFeat == 0) 1 else 0),
    prOpen' = false, prFix' = 0, prFeat' = 0,
    split' = split, readsManifest' = readsManifest, day' = day, npmLastNonFix' = npmLastNonFix,
    windowBroken' = windowBroken, fixDelayed' = fixDelayed,
  }

  /** `release.yml` puts one non-fix release on npm today. */
  action publishNonFix = all {
    inflightNonFix > 0,
    inflightNonFix' = inflightNonFix - 1,
    npmLastNonFix' = day,
    windowBroken' = (windowBroken or day - npmLastNonFix < WINDOW),
    split' = split, readsManifest' = readsManifest, day' = day, pendingFix' = pendingFix, pendingFeat' = pendingFeat,
    prOpen' = prOpen, prFix' = prFix, prFeat' = prFeat, inflightFix' = inflightFix, fixDelayed' = fixDelayed,
  }

  /** A fix-only release reaches npm; it does not move the window. */
  action publishFix = all {
    inflightFix > 0, inflightFix' = inflightFix - 1,
    split' = split, readsManifest' = readsManifest, day' = day, pendingFix' = pendingFix, pendingFeat' = pendingFeat,
    prOpen' = prOpen, prFix' = prFix, prFeat' = prFeat, inflightNonFix' = inflightNonFix,
    npmLastNonFix' = npmLastNonFix, windowBroken' = windowBroken, fixDelayed' = fixDelayed,
  }

  /** Time passes: a day to a week. */
  action tick = all {
    nondet d = 1.to(WINDOW).oneOf()
    all {
      day + d <= MAX_DAY, day' = day + d,
      split' = split, readsManifest' = readsManifest, pendingFix' = pendingFix, pendingFeat' = pendingFeat,
      prOpen' = prOpen, prFix' = prFix, prFeat' = prFeat, inflightNonFix' = inflightNonFix, inflightFix' = inflightFix,
      npmLastNonFix' = npmLastNonFix, windowBroken' = windowBroken, fixDelayed' = fixDelayed,
    },
  }

  action step = any { landFix, landFeat, refresh, merge, publishNonFix, publishFix, tick }

  /** No two non-fix releases of the package reach npm within 7 days of each other. */
  val windowHolds = not(windowBroken)
  /** No refresh ever leaves a pending fix out of the Version PR. */
  val fixNeverDelayed = not(fixDelayed)

  /** The shipped design. */
  val safety = (split and readsManifest) implies (windowHolds and fixNeverDelayed)
  /** Holding the whole Version PR: expected to be VIOLATED (a fix waits behind a feature). */
  val unsplitHolds = not(split) implies fixNeverDelayed
  /** Reading npm alone: expected to be VIOLATED (a second feature while the first publishes). */
  val npmOnlyHolds = not(readsManifest) implies windowHolds
  /**
   * Non-vacuity: expected to be VIOLATED. The shipped design does put a feature on npm while a
   * fix is pending beside a held one — `safety` does not hold because nothing ever ships.
   */
  val shippedNeverReleasesAFeature = (split and readsManifest) implies npmLastNonFix == NEVER
}
