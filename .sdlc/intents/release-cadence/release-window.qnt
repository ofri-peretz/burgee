// -*- mode: Bluespec; -*-
/**
 * The release window (release-cadence, `scripts/release-window.mts` and
 * `.github/workflows/changesets-pr.yml`), for one package.
 *
 *   - Changesets land on main: fixes (a `patch`), security fixes (a `Security:` summary) and
 *     features (`minor` / `major`). A feature's code is on main from the moment it lands.
 *   - Every push to main, and a daily schedule, refreshes the one Version PR from what is
 *     pending. The PR auto-merges; the merge starts a release, which reaches npm later. The
 *     release is built from main at the merge, so it carries every feature main holds then,
 *     whatever version number the PR gave it.
 *   - The window: a feature may go into the PR only when the package's previous non-fix release
 *     is at least 7 days old. A security fix is never delayed.
 *
 * Three design choices, picked at `init` so one simulation walks both sides of each:
 *
 *   split          — a held feature is set aside and the rest of the PR still merges. The
 *                    alternative holds the whole Version PR: `unsplitHolds` is expected to be
 *                    VIOLATED, a security fix that waits behind a held feature.
 *   readsManifest  — "previous non-fix release" counts a non-fix release that is merged but not
 *                    yet on npm (main's manifest holds an `x.y.0` npm does not). Reading npm alone
 *                    lets a second feature through while the first is still publishing:
 *                    `npmOnlyHolds` is expected to be VIOLATED.
 *   fixWaits       — a fix to a package with a held feature waits with it, and `release.yml`
 *                    defers a fix version built while a feature is pending on main; a security
 *                    fix instead releases the package with everything held for it. The
 *                    alternative, shipped until #1253 (D-20261026-release-window-holds-code), held
 *                    the feature's version number and published its code in a patch:
 *                    `holdsVersionsNotCode` is expected to be VIOLATED.
 *
 * `safety` is the shipped design: all three choices taken, and no guarantee broken.
 */
module releaseWindow {
  pure val WINDOW = 7
  pure val NEVER = -100
  pure val MAX_DAY = 40
  pure val MAX_PENDING = 2

  var split: bool
  var readsManifest: bool
  var fixWaits: bool

  var day: int
  /** Changesets on main not yet in a merged Version PR. */
  var pendingFix: int
  var pendingSec: int
  var pendingFeat: int
  /** The open Version PR's contents, as of its last refresh. */
  var prOpen: bool
  var prFix: int
  var prSec: int
  var prFeat: int
  /** The PR carries features inside the window because a security fix opened it. */
  var prForced: bool
  /** Merged, not yet on npm: one release run each. */
  var inflightNonFix: int
  var inflightForced: int
  /** Fix-only releases: `carrying` was built while a feature was pending on main, with no security fix in it. */
  var inflightFixClean: int
  var inflightFixCarrying: int
  /** What the registry says: the day of the newest non-fix release. */
  var npmLastNonFix: int
  /** Ghosts: what the guarantees are about. */
  var windowBroken: bool
  var fixDelayed: bool
  var secDelayed: bool
  var featShippedAsFix: bool
  /** Witness: a fix did wait behind its package's held feature. */
  var fixHeldBehindFeature: bool

  action init = all {
    nondet s = Set(true, false).oneOf()
    nondet m = Set(true, false).oneOf()
    nondet w = Set(true, false).oneOf()
    all {
      split' = s, readsManifest' = m, fixWaits' = w,
      day' = 0, pendingFix' = 0, pendingSec' = 0, pendingFeat' = 0,
      prOpen' = false, prFix' = 0, prSec' = 0, prFeat' = 0, prForced' = false,
      inflightNonFix' = 0, inflightForced' = 0, inflightFixClean' = 0, inflightFixCarrying' = 0,
      npmLastNonFix' = NEVER,
      windowBroken' = false, fixDelayed' = false, secDelayed' = false, featShippedAsFix' = false,
      fixHeldBehindFeature' = false,
    },
  }

  /** What no action but `refresh` and `merge` touches: the open PR. */
  action keepPr = all { prOpen' = prOpen, prFix' = prFix, prSec' = prSec, prFeat' = prFeat, prForced' = prForced }
  /** The design, fixed at `init`. */
  action keepDesign = all { split' = split, readsManifest' = readsManifest, fixWaits' = fixWaits }
  action keepInflight = all {
    inflightNonFix' = inflightNonFix, inflightForced' = inflightForced,
    inflightFixClean' = inflightFixClean, inflightFixCarrying' = inflightFixCarrying,
  }
  action keepGhosts = all {
    windowBroken' = windowBroken, fixDelayed' = fixDelayed, secDelayed' = secDelayed,
    featShippedAsFix' = featShippedAsFix, fixHeldBehindFeature' = fixHeldBehindFeature,
  }

  /** A PR merges to main with a fix changeset. */
  action landFix = all {
    pendingFix < MAX_PENDING, pendingFix' = pendingFix + 1,
    pendingSec' = pendingSec, pendingFeat' = pendingFeat, day' = day, npmLastNonFix' = npmLastNonFix,
    keepDesign, keepPr, keepInflight, keepGhosts,
  }

  /** A PR merges to main with a `Security:` changeset. */
  action landSec = all {
    pendingSec < MAX_PENDING, pendingSec' = pendingSec + 1,
    pendingFix' = pendingFix, pendingFeat' = pendingFeat, day' = day, npmLastNonFix' = npmLastNonFix,
    keepDesign, keepPr, keepInflight, keepGhosts,
  }

  /** A PR merges to main with a feature changeset: its code is on main from now on. */
  action landFeat = all {
    pendingFeat < MAX_PENDING, pendingFeat' = pendingFeat + 1,
    pendingFix' = pendingFix, pendingSec' = pendingSec, day' = day, npmLastNonFix' = npmLastNonFix,
    keepDesign, keepPr, keepInflight, keepGhosts,
  }

  /** The previous non-fix release as the refresh reads it. */
  val previous = if (readsManifest and inflightNonFix + inflightForced > 0) MAX_DAY + WINDOW else npmLastNonFix
  val windowOpen = day - previous >= WINDOW

  /**
   * `changesets-pr.yml`'s version job (a push, or the daily schedule): plan, then open or
   * refresh the Version PR from what may release now.
   */
  action refresh = {
    val featHeld = pendingFeat > 0 and not(windowOpen)
    // The shipped design: a pending security fix releases the package with everything held for it.
    val forced = split and fixWaits and pendingSec > 0
    val featNow = if (windowOpen or forced) pendingFeat else 0
    // The rejected design: any held feature holds the whole PR, security fixes with it.
    val wholePrHeld = not(split) and featHeld
    // The shipped design: a fix waits behind its package's held feature, unless security opened it.
    val fixHeld = wholePrHeld or (split and fixWaits and featHeld and not(forced))
    val fixNow = if (fixHeld) 0 else pendingFix
    val secNow = if (wholePrHeld) 0 else pendingSec
    val featIn = if (wholePrHeld) 0 else featNow
    all {
      prOpen' = (fixNow + secNow + featIn > 0), prFix' = fixNow, prSec' = secNow, prFeat' = featIn,
      prForced' = (featIn > 0 and not(windowOpen)),
      fixDelayed' = (fixDelayed or (fixNow < pendingFix and not(featHeld))),
      secDelayed' = (secDelayed or secNow < pendingSec),
      fixHeldBehindFeature' = (fixHeldBehindFeature or (fixNow < pendingFix and featHeld)),
      day' = day, pendingFix' = pendingFix, pendingSec' = pendingSec, pendingFeat' = pendingFeat,
      npmLastNonFix' = npmLastNonFix, windowBroken' = windowBroken, featShippedAsFix' = featShippedAsFix,
      keepDesign, keepInflight,
    }
  }

  /**
   * Auto-merge lands the Version PR: what it carried is now a release in flight, built from main
   * as it is now. A fix-only release built while a feature is pending carries that feature's code.
   */
  action merge = {
    val fixOnly = prFeat == 0 and prFix + prSec > 0
    val carrying = fixOnly and pendingFeat > 0 and prSec == 0
    all {
      prOpen,
      pendingFix' = pendingFix - prFix, pendingSec' = pendingSec - prSec, pendingFeat' = pendingFeat - prFeat,
      inflightNonFix' = inflightNonFix + (if (prFeat > 0 and not(prForced)) 1 else 0),
      inflightForced' = inflightForced + (if (prFeat > 0 and prForced) 1 else 0),
      inflightFixClean' = inflightFixClean + (if (fixOnly and not(carrying)) 1 else 0),
      inflightFixCarrying' = inflightFixCarrying + (if (carrying) 1 else 0),
      prOpen' = false, prFix' = 0, prSec' = 0, prFeat' = 0, prForced' = false,
      day' = day, npmLastNonFix' = npmLastNonFix,
      keepDesign, keepGhosts,
    }
  }

  /** `release.yml` puts one non-fix release on npm today. */
  action publishNonFix = all {
    inflightNonFix > 0,
    inflightNonFix' = inflightNonFix - 1,
    npmLastNonFix' = day,
    windowBroken' = (windowBroken or day - npmLastNonFix < WINDOW),
    inflightForced' = inflightForced, inflightFixClean' = inflightFixClean, inflightFixCarrying' = inflightFixCarrying,
    day' = day, pendingFix' = pendingFix, pendingSec' = pendingSec, pendingFeat' = pendingFeat,
    fixDelayed' = fixDelayed, secDelayed' = secDelayed, featShippedAsFix' = featShippedAsFix, fixHeldBehindFeature' = fixHeldBehindFeature,
    keepDesign, keepPr,
  }

  /**
   * A security fix opened the window: the release goes out now, and the window starts again from
   * it. Releases publish in merge order, so one merged before it is not overtaken.
   */
  action publishForced = all {
    inflightForced > 0, inflightNonFix == 0,
    inflightForced' = inflightForced - 1,
    npmLastNonFix' = day,
    inflightNonFix' = inflightNonFix, inflightFixClean' = inflightFixClean, inflightFixCarrying' = inflightFixCarrying,
    day' = day, pendingFix' = pendingFix, pendingSec' = pendingSec, pendingFeat' = pendingFeat,
    keepDesign, keepPr, keepGhosts,
  }

  /** A fix-only release that carries nothing it does not version reaches npm; it does not move the window. */
  action publishFixClean = all {
    inflightFixClean > 0, inflightFixClean' = inflightFixClean - 1,
    inflightNonFix' = inflightNonFix, inflightForced' = inflightForced, inflightFixCarrying' = inflightFixCarrying,
    day' = day, pendingFix' = pendingFix, pendingSec' = pendingSec, pendingFeat' = pendingFeat, npmLastNonFix' = npmLastNonFix,
    keepDesign, keepPr, keepGhosts,
  }

  /**
   * A fix-only release built while a feature was pending. `release.yml`'s backstop (fixWaits)
   * defers it, and the fix rides the package's next release; without it, the feature's code
   * reaches npm under a patch number.
   */
  action publishFixCarrying = all {
    inflightFixCarrying > 0, inflightFixCarrying' = inflightFixCarrying - 1,
    pendingFix' = (if (fixWaits) pendingFix + 1 else pendingFix),
    featShippedAsFix' = (featShippedAsFix or not(fixWaits)),
    fixHeldBehindFeature' = (fixHeldBehindFeature or fixWaits),
    inflightNonFix' = inflightNonFix, inflightForced' = inflightForced, inflightFixClean' = inflightFixClean,
    day' = day, pendingSec' = pendingSec, pendingFeat' = pendingFeat, npmLastNonFix' = npmLastNonFix,
    windowBroken' = windowBroken, fixDelayed' = fixDelayed, secDelayed' = secDelayed,
    keepDesign, keepPr,
  }

  /** Time passes: a day to a week. */
  action tick = all {
    nondet d = 1.to(WINDOW).oneOf()
    all {
      day + d <= MAX_DAY, day' = day + d,
      pendingFix' = pendingFix, pendingSec' = pendingSec, pendingFeat' = pendingFeat, npmLastNonFix' = npmLastNonFix,
      keepDesign, keepPr, keepInflight, keepGhosts,
    },
  }

  action step = any { landFix, landSec, landFeat, refresh, merge, publishNonFix, publishForced, publishFixClean, publishFixCarrying, tick }

  /** No two non-fix releases of the package reach npm within 7 days, except one a security fix opened. */
  val windowHolds = not(windowBroken)
  /** A fix waits only behind a feature of its own package that the window holds. */
  val fixNeverDelayed = not(fixDelayed)
  /** No refresh ever leaves a pending security fix out of the Version PR. */
  val securityNeverDelayed = not(secDelayed)
  /** No feature's code reaches npm under a patch number, except beside a security fix. */
  val featureNeverShipsAsFix = not(featShippedAsFix)

  /** The shipped design. */
  val safety = (split and readsManifest and fixWaits) implies (windowHolds and fixNeverDelayed and securityNeverDelayed and featureNeverShipsAsFix)
  /** Holding the whole Version PR: expected to be VIOLATED (a security fix waits behind a feature). */
  val unsplitHolds = not(split) implies securityNeverDelayed
  /** Reading npm alone: expected to be VIOLATED (a second feature while the first publishes). */
  val npmOnlyHolds = not(readsManifest) implies windowHolds
  /** Holding version numbers, not code (the design until #1253): expected to be VIOLATED. */
  val holdsVersionsNotCode = (split and readsManifest and not(fixWaits)) implies featureNeverShipsAsFix
  /**
   * Non-vacuity: expected to be VIOLATED. The shipped design does put a feature on npm, so
   * `safety` does not hold because nothing ever ships.
   */
  val shippedNeverReleasesAFeature = (split and readsManifest and fixWaits) implies npmLastNonFix == NEVER
  /** Non-vacuity: expected to be VIOLATED. The shipped design does hold a fix behind a feature. */
  val shippedNeverHoldsAFix = (split and readsManifest and fixWaits) implies not(fixHeldBehindFeature)
}
