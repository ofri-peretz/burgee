// -*- mode: Bluespec; -*-
/**
 * `burgee migrate` over a project whose files load modules by computed names
 * (packages/burgee/src/migrate.ts: `scan`, `rewriteFile`, `heldBy`, `migrate()`).
 *
 * Two files and two incumbents, every combination chosen once at init: which incumbents each file
 * imports by a literal, which it names in a string or template outside a specifier, the shape of
 * its one computed specifier (or none), and whether something else refuses it (a deep import).
 * Then the run as the code runs it: every file is scanned, in any order, before anything is held;
 * then held; then the files that move are written, in any order.
 *
 * What a computed name could load is the model's one assumption, and the scanner's: it is built
 * from the literals in its own file, or from the user's command line (spec.md, Constraints). So:
 *   - `other` (`import(name)`, a template, `require(a + b)` …) could load anything its file names;
 *   - the three shapes (`cwd` R1, `member` R2, `element` R3) load the user's file or module, or a
 *     name the file's own strings build.
 *
 * `safety` is the intent's question: a rewrite never moves an incumbent that a computed name could
 * still load, and U12-4 still holds (an incumbent moves in every file that imports it, or in none).
 *
 * The rejected designs are steps, so CI runs each and requires `safety` to FAIL (models.yml):
 *   stepNoGuard     — R4 dropped: a shape passes even beside a string that names an incumbent;
 *   stepWide        — classify widened: any computed specifier passes when no string names one;
 *   stepImportsOnly — the staged spec's R4: the file refuses, but holds only what it imports, so
 *                     `const name = 'chalk'; import(argv.x)` lets chalk move in the next file;
 *   stepEager       — each file written as it is scanned, before the run knows what is held.
 */
module dynamic {
  pure val FILES = Set("a", "b")
  pure val HOSTS = Set("h1", "h2")
  pure val SITES = Set("none", "cwd", "member", "element", "other")
  pure val SHAPES = Set("cwd", "member", "element")

  // inputs
  var imports: str -> Set[str]
  var strings: str -> Set[str]
  var site: str -> str
  var deep: str -> bool
  // the run
  var phase: str
  var scanned: Set[str]
  var refused: Set[str]
  var retained: str -> Set[str]
  var held: Set[str]
  var written: Set[str]
  /** (file, incumbent) pairs rewritten. */
  var moved: Set[(str, str)]

  /** What `f`'s computed specifier could load, under the assumption above. */
  def couldLoad(f: str): Set[str] =
    if (site.get(f) == "none") Set()
    else if (site.get(f) == "other") imports.get(f).union(strings.get(f))
    else strings.get(f)

  /** R1–R4: the computed specifier is read as loading no incumbent. */
  def passes(v: str, f: str): bool =
    if (v == "noGuard") SHAPES.contains(site.get(f))
    else if (v == "wide") site.get(f) != "none" and strings.get(f) == Set()
    else SHAPES.contains(site.get(f)) and strings.get(f) == Set()

  def nonLiteral(v: str, f: str): bool = site.get(f) != "none" and not(passes(v, f))

  /** `rewriteFile`: what a refused file holds. R4 holds the incumbents its strings name, too. */
  def holds(v: str, f: str): Set[str] =
    if (nonLiteral(v, f) and v != "importsOnly") imports.get(f).union(strings.get(f)) else imports.get(f)

  /** A file is refused when it has something to refuse and something to hold. */
  def refuses(v: str, f: str): bool = (deep.get(f) or nonLiteral(v, f)) and holds(v, f) != Set()

  action keepInputs = all { imports' = imports, strings' = strings, site' = site, deep' = deep }

  action init = all {
    nondet i = setOfMaps(FILES, HOSTS.powerset()).oneOf()
    nondet s = setOfMaps(FILES, HOSTS.powerset()).oneOf()
    nondet k = setOfMaps(FILES, SITES).oneOf()
    nondet d = setOfMaps(FILES, Set(true, false)).oneOf()
    all {
      imports' = i, strings' = s, site' = k, deep' = d,
      phase' = "scanning", scanned' = Set(), refused' = Set(), retained' = FILES.mapBy(f => Set()),
      held' = Set(), written' = Set(), moved' = Set(),
    },
  }

  /** The files `f` rewrites, given what is held so far. */
  def movesIn(f: str, h: Set[str]): Set[(str, str)] = imports.get(f).exclude(h).map(x => (f, x))

  /** One file of `scanBatch`. `eager` writes it on the spot, as migrate did before U12. */
  action scanOne(v: str): bool = all {
    phase == "scanning",
    nondet f = FILES.exclude(scanned).oneOf()
    all {
      keepInputs,
      scanned' = scanned.union(Set(f)),
      refused' = if (refuses(v, f)) refused.union(Set(f)) else refused,
      retained' = retained.set(f, if (refuses(v, f)) holds(v, f) else Set()),
      phase' = if (scanned.union(Set(f)) == FILES) "scanned" else "scanning",
      held' = held,
      written' = if (v == "eager" and not(refuses(v, f))) written.union(Set(f)) else written,
      moved' = if (v == "eager" and not(refuses(v, f))) moved.union(movesIn(f, FILES.map(g => retained.get(g)).flatten())) else moved,
    },
  }

  /** `heldBy`: every incumbent a refused file still names. */
  action hold = all {
    phase == "scanned",
    keepInputs,
    phase' = "held",
    held' = FILES.map(g => retained.get(g)).flatten(),
    scanned' = scanned, refused' = refused, retained' = retained, written' = written, moved' = moved,
  }

  /** One `writeAll` file: an unrefused file moves every import that is not held. */
  action writeOne = all {
    phase == "held",
    nondet f = FILES.exclude(refused).exclude(written).oneOf()
    all {
      keepInputs,
      written' = written.union(Set(f)),
      moved' = moved.union(movesIn(f, held)),
      phase' = phase, scanned' = scanned, refused' = refused, retained' = retained, held' = held,
    },
  }

  action idle = all {
    phase == "held",
    FILES.exclude(refused).exclude(written) == Set(),
    keepInputs,
    phase' = phase, scanned' = scanned, refused' = refused, retained' = retained, held' = held, written' = written, moved' = moved,
  }

  action stepWith(v: str): bool = any { scanOne(v), hold, writeOne, idle }
  action step = stepWith("shipped")
  action stepNoGuard = stepWith("noGuard")
  action stepWide = stepWith("wide")
  action stepImportsOnly = stepWith("importsOnly")
  action stepEager = stepWith("eager")

  val movedAnywhere = moved.map(m => m._2)

  /** The intent: no incumbent a computed name could load is moved, in any file. */
  val computedNeverSplits = FILES.forall(f => couldLoad(f).forall(h => not(movedAnywhere.contains(h))))
  /** U12-4, once the run is written: an incumbent moved anywhere moved in every file that imports it. */
  val allOrNothing = (phase == "held" and FILES.exclude(refused).exclude(written) == Set()) implies
    FILES.forall(f => imports.get(f).forall(h => movedAnywhere.contains(h) implies moved.contains((f, h))))
  /** A refused file is left exactly as it was. */
  val refusedUntouched = moved.forall(m => not(refused.contains(m._1)))

  val safety = computedNeverSplits and allOrNothing and refusedUntouched

  /** Witness, expected to be VIOLATED: some run moves an import in a file whose computed specifier passed — the postcss-cli shape. */
  val passedNeverMoves = moved.forall(m => not(SHAPES.contains(site.get(m._1))))
}
