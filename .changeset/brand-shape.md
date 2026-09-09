---
'burgee': minor
---

`burgee/brand` gains three options, so a family of marks can come out of one declaration.

`shape` replaces the swallowtail with your own silhouette (SVG path data, same `0 0 100 100` box, filled `evenodd` so a nested subpath cuts a hole) — for a sibling brand whose name is not a flag: a roundel is rings, a parrot is a parrot.

`sheen` lays a soft highlight across the field, clipped to the silhouette and drawn under the charge, so the mark keeps the contrast it was measured at. `alive()` is the same mark with that highlight sweeping across — for a site header, never a favicon — parked still under `prefers-reduced-motion`.

`bevel` is the third dimension a logo can afford: two stroked copies of the silhouette clipped to itself, light offset toward the light source and dark away from it, so the edge lifts and the face stays flat. Sub-pixel at 16px, where it disappears rather than muddies.

All three are additive: a brand that declares none renders byte-for-byte what it rendered before.
