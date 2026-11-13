// -*- mode: Bluespec; -*-
/**
 * apicontract's `$ref` resolver (`spec.md` R-Q3): the depth-first walk that inlines references while
 * an adapter reads a spec into the model, and that `explain` and `gen` both depend on.
 *
 * A schema graph is chosen in init: every node references any subset of nodes, so self-references,
 * mutual cycles and diamonds are all reached. The walk keeps the open path (`path`) and, per frame,
 * the children already expanded (`seen`). A child already on the open path is a cycle: it is emitted
 * as a kept `$ref` and never entered.
 *
 * `safety`: the open path never holds a node twice; it is never deeper than the node count; each frame
 * tracks only its own children; when the walk finishes, every edge out of the root was handled.
 * `everyGraphFinishes` is
 * expected to be VIOLATED, at a state where the walk has finished — it shows completion is reached,
 * so `safety` does not hold vacuously on walks that never end.
 *
 * Run by hand:
 *   npx -y @informalsystems/quint@0.33.0 run .sdlc/intents/apicontract/adapter.qnt \
 *     --invariant=safety --max-steps=30 --max-samples=20000
 */
module adapter {
  pure val NODES = Set("A", "B", "C")
  pure val ROOT = "A"

  var refs: str -> Set[str]
  var path: List[str]
  var seen: List[Set[str]]
  // Ghost: every (from, to) edge the walk handled, and how.
  var expanded: Set[(str, str)]
  var keptAsRef: Set[(str, str)]
  var finished: bool

  pure def onPath(p: List[str], n: str): bool = p.indices().exists(i => p[i] == n)

  action init = {
    nondet r = NODES.setOfMaps(NODES.powerset()).oneOf()
    all {
      refs' = r,
      path' = [ROOT],
      seen' = [Set()],
      expanded' = Set(),
      keptAsRef' = Set(),
      finished' = false,
    }
  }

  // Take one unhandled child of the top frame: enter it, or keep it as a cycle `$ref`.
  action descend = {
    val top = path[length(path) - 1]
    val handled = seen[length(seen) - 1]
    val todo = refs.get(top).exclude(handled)
    all {
      not(finished),
      todo.size() > 0,
      nondet child = todo.oneOf()
      val seenTop = seen.replaceAt(length(seen) - 1, handled.union(Set(child)))
      if (onPath(path, child)) all {
        path' = path,
        seen' = seenTop,
        expanded' = expanded,
        keptAsRef' = keptAsRef.union(Set((top, child))),
        finished' = false,
        refs' = refs,
      } else all {
        path' = path.append(child),
        seen' = seenTop.append(Set()),
        expanded' = expanded.union(Set((top, child))),
        keptAsRef' = keptAsRef,
        finished' = false,
        refs' = refs,
      },
    }
  }

  // The top frame has handled every child: close it.
  action ascend = {
    val top = path[length(path) - 1]
    all {
      not(finished),
      refs.get(top).subseteq(seen[length(seen) - 1]),
      path' = path.slice(0, length(path) - 1),
      seen' = seen.slice(0, length(seen) - 1),
      expanded' = expanded,
      keptAsRef' = keptAsRef,
      finished' = length(path) == 1,
      refs' = refs,
    }
  }

  action idle = all {
    finished,
    path' = path,
    seen' = seen,
    expanded' = expanded,
    keptAsRef' = keptAsRef,
    finished' = finished,
    refs' = refs,
  }

  action step = any { descend, ascend, idle }

  // The open path never holds a node twice: no cycle is ever entered.
  val noNodeTwiceOnPath =
    path.indices().forall(i => path.indices().forall(j => i == j or path[i] != path[j]))
  // So the walk is never deeper than the graph has nodes.
  val depthBounded = length(path) <= NODES.size()
  // Each open frame only ever records children its node actually references. (An edge may be
  // inlined on one path and kept as a cycle `$ref` on another — that is correct, so the rule is per
  // occurrence, never per edge; see spec.md R-Q3.)
  val framesTrackOwnChildren =
    path.indices().forall(i => seen[i].subseteq(refs.get(path[i])))
  // When the walk finishes, every edge out of the root was handled.
  val rootEdgesHandled =
    finished implies refs.get(ROOT).forall(c => expanded.contains((ROOT, c)) or keptAsRef.contains((ROOT, c)))

  val safety = all { noNodeTwiceOnPath, depthBounded, framesTrackOwnChildren, rootEdgesHandled }

  // Expected violation (see header).
  val everyGraphFinishes = not(finished)
}
