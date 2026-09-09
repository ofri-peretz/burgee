# Commission brief — three sibling marks

> For an illustrator or brand designer. Everything a mark has to be is here, with the
> numbers already measured. The identity model in [`identity-model.md`](./identity-model.md)
> says what each package *is*; this says what the deliverable is and what it has to survive.

## What is being commissioned

Three marks: **roundel**, **flagstaff**, **caique**. Not burgee — its swallowtail is settled
and is the benchmark the other three are being measured against.

The benchmark is worth stating plainly, because it is the whole brief in one line:
**burgee is one silhouette with one mark on it and nothing else.** Every attempt that added
a third element — plumage patches, a signpost board, a base, a stripe — got worse. Three
elements is already too many.

| Mark | Must read as | Must not read as |
| :-- | :-- | :-- |
| `roundel` | Military aircraft insignia: a field, one ring, a charge at the centre | A target, a record, a loading spinner |
| `flagstaff` | A staff with something hoisted on it — support and verticality, the only mark that stands | A crucifix (a board centred on a post is one), a pill, a signpost |
| `caique` | A black-headed caique — hooked beak, the only living thing in the family | A duck, a generic songbird, a speech bubble |

## Hard constraints

Not preferences. A mark that misses one of these is not usable, however good it looks at
poster size.

| Constraint | Value |
| :-- | :-- |
| Body colour | Ink `#0a0a0a`, flat. No gradient — one was tried and turns to mud on any shape larger than a thin flag |
| Accent colours | Rock `#f4794a`, juniper `#0d9460`, paper `#efe9dd`. No colour outside this set |
| The Interlace mark | Two capsules at −30°, present on every mark, in a position that belongs to that object — a roundel's centre, a flag's field, a bird's wing |
| Contrast | Every accent on its own ground clears **3:1**, measured with WCAG 2.2. Rock on ink is 7.24:1, juniper on ink 5.11:1, paper on juniper 3.20:1. Rock on juniper is 1.42:1 and is therefore forbidden |
| Legibility floor | Readable at **16px**. Every mark is checked as a favicon before it is checked as a lockup |
| Construction | One closed outline per shape. Filled `evenodd`: a nested subpath cuts a hole (this is how a ring gets its centre and an eye its white), and overlapping subpaths cut holes where they meet |
| Coordinate space | `0 0 100 100`, y-down, SVG path data only. No raster, no strokes as fills, no filters, no embedded fonts |

## Deliverable

For each mark, one SVG path-data string per element:

1. **`shape`** — the silhouette, as a single `d` string in the 100-unit box.
2. **`markings`** *(optional)* — any patch of a second colour, as SVG markup in the same box.
   These are clipped to the silhouette, so a patch may be drawn oversized on the side where
   it should not show an edge; the outline becomes that edge.
3. **The charge placement** — where the Interlace mark rides, as a point in the same box, and
   at what fraction of the size it takes on burgee's own flag.

Nothing else. Sheen, bevel, outline, favicon, lockup, OG card, cover and the 3D stage are all
generated from those values by [`scripts/brand.mts`](../../scripts/brand.mts) — the designer
never produces a favicon or a lockup, and should not.

## How it lands in the repo

A path string drops straight into the declaration in `scripts/brand.mts`; `npm run brand`
regenerates twenty-three surfaces from it and `npm run brand -- --check` fails the build if
any of them is ever hand-edited afterwards.

**If the work is delivered as a drawing rather than as path data** — an Illustrator file, a
traced illustration, a 3D model — it is pinned as an asset in the Interlace repository, not
here, with a licence file beside it naming author and terms. A mark whose licence is "found
on the internet" cannot become a trademark. `burgee/brand` stays the source for everything
derivable; a pinned asset is referenced, never copied into `brand-assets/`.

## What already exists

The current three marks are in [`brand-assets/`](../../brand-assets/) and are usable as a
placeholder or as a starting point — the roundel in particular is close, being the only one
of the three built from geometry rather than drawn. They are all generated, so replacing any
one of them is a one-line change and costs nothing.
