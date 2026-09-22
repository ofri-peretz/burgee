# The identity model — what each package is, and what its mark has to say

> The brief that should have existed before any mark was drawn. Everything here is read out
> of the intents in [`.sdlc/intents/`](../intents/), not invented: if a line below and an
> intent disagree, the intent wins and this file is wrong.

## The stack, as four layers

The packages are not a suite that ships together. Each is a standalone product with its own
competitors, and the family is a claim about *layers of a CLI*, not about a bundle.

| Layer | Package | What it owns | Competitors it is measured against |
| :-- | :-- | :-- | :-- |
| **Declaration** | `burgee` | A command declares itself once; help, `--json`, `--schema`, `--mcp`, completions and types are projections of that declaration | commander, yargs, oclif |
| **Colour** | `roundel` | One output policy decided once from the runtime, nine semantic tokens, a contrast-checked theme | chalk, picocolors |
| **Motion** | `flagstaff` | The repaint loop, and plugins as data — every animation carrying a static projection for pipes, `--json` and screen readers | ora, log-update, boxen, cli-table3, Ink |
| **Dialogue** | `caique` | Prompts that are flags first: a caller who passed the flag is never asked, and a non-TTY caller gets an error naming the flag rather than a hang | inquirer, clack |

Under those four sits the **foundation tier** — the loop's own plumbing:

| Layer | Package | What it owns | Named for |
| :-- | :-- | :-- | :-- |
| **Text** | `linegauge` | Measure, wrap, truncate and slice styled text without the edge fraying | The printer's steel rule, marked in picas and points |
| **Config** | `seniority` | Precedence across flag, env, project file, home file and default, with provenance | Ranking higher through longer service, and therefore winning a conflict |
| **Process** | `bellpull` | Run a subprocess; resolve the executable; return a result every caller can read | The cord in one room, wired to a bell in another |
| **Lifecycle** | `closeout` | Exit handlers that run once on every path, terminal restore, a bounded deadline | To settle and finish — nothing left open |
| **Terminal** | `paratext` | OSC: hyperlinks, images, window title, clipboard, notifications, bell — each with a static fallback | Everything around a text that is not the text |

`compat-oracle` is a measuring instrument, never published, and has no public identity.

## What each mark has to say

The metaphors are already load-bearing in the code and the docs — the marks make them
visible rather than adding a second story.

### burgee — identity, not instruction

A burgee is the swallowtail flag a boat flies to say which club it belongs to. It declares
what a thing *is*; it does not tell anyone what to do. That is exactly the difference
between a manifest and a script, and it is why the framework is named after a flag.

**The mark must say:** this is a declaration. **Only burgee flies the swallowtail** — a
sibling that flies one is claiming to be the declaration layer.

### roundel — colour as identity

A roundel is a flag's colours carried onto a surface that is not a flag: the rings on a
wing, the bar-and-circle on the Underground. Identity expressed purely in colour. The
package is the same move — not `red`, but `error`; not a palette, but the colours that mean
*you*, carried onto a terminal.

**The mark must say:** colour is the subject. Drawn as military aircraft insignia actually
works — every air force on the reference sheet uses one grammar: a field, a ring inside it,
and something at the centre saying whose it is. Ours is an ink field, a rock ring, and the
Interlace mark at the centre.

### flagstaff — what holds the flag up

The staff is the simplest part of the apparatus and the only part always in view. A flag is
hoisted on it, held at the dip or close up, changed, and lowered. That is a render loop:
frames hoisted, held, changed, lowered, in view of whoever is reading.

**The mark must say:** support, and verticality. Drawn as the Route 66 signpost the town is
known for: a post at the hoist, one board off it, and what the board carries is the point of
the whole structure. It is the only mark that **stands**, and the only one carrying something
rather than being it. A board centred on a post with the post rising through it reads as a
crucifix — the asymmetry is load-bearing, not styling.

### caique — the one that answers back

A caique is a small, loud, never-silent parrot, and also the boat that runs between ship and
shore carrying messages across the gap. Both are the package: the go-between that carries a
question out and brings an answer back, and **never hangs**.

**The mark must say:** something alive is on the other end. Drawn as the black-headed caique
actually looks — black cap, orange throat, white belly, green wing — which by luck rather
than design is already close to the Interlace palette. The cap is the body showing through;
every other patch is a marking clipped to the silhouette, so each is drawn generously and the
outline decides where it ends. The Interlace mark rides on the wing, in paper and ink,
because the lifted pair on a green wing is 1.42:1 and disappears.

### The foundation five

They are plumbing, and their marks say so: no creature, no scene, nothing that asks to be
looked at twice. Each is the instrument its name means, drawn flat.

**`linegauge`** is a rule with its ticks **cut through it** — a counter under `evenodd`, so
the markings are the one part of the mark that is not ink, which is what a rule's markings
are: absence, machined into steel.

**`seniority`** is three rank chevrons. One is a mark and two is a coincidence; three is the
insignia, and the Interlace mark rides above them where a badge carries its device.

**`bellpull`** is the cord and its pull, drawn as one outline — a cord ending inside its own
handle would cut a hole where the two overlap. The mark sits on the pull, the part a hand
actually takes.

**`closeout`** is the double rule an accountant draws under a settled total, with the mark
above it as the total it closes.

**`paratext`** is a page with its text block cut away, so the ink is exactly the paratext:
three margins and a deep head, with the mark in the head where a page carries its title. The
dog-ear is what makes the rectangle a page rather than a frame. It is the one mark closest to a
stock icon (a document), and it is saved from being one by the hole: the text is the part
that is missing.

## The system every mark obeys

Enforced by `scripts/brand.mts` and `npm run brand -- --check`, not by taste:

| Rule | Value | Why |
| :-- | :-- | :-- |
| Body | flat ink `#0a0a0a` | A gradient's dark midpoint did contrast work on a thin flag and turned to mud on anything larger |
| Charge | the lifted pair, `#f4794a` / `#0d9460` | 7.24:1 and 5.11:1 on ink, against 3.50:1 and 3.02:1 for the deep pair. A logo has no stylesheet to compensate with |
| Charge placement | wherever the mark belongs on that object | The Interlace mark is the constant; what surrounds it, and where it rides, is the variable — a roundel's centre, a sign's board, a bird's wing |
| Markings | clipped to the silhouette | A patch drawn to the outline cannot float; the outline is the edge it does not draw |
| Outline | one band, `#efe9dd` | A flat ink body dissolves into a dark card; on paper the band disappears and the body carries the silhouette |
| Sheen | `0.16`, swept only in `alive()` | The only gradient left in the system, and it parks under `prefers-reduced-motion` |
| Bevel | `0.28` | The whole of the third dimension a logo can afford: an edge that catches light, sub-pixel at 16px and gone rather than muddy |
| Floor | legible at 16px | Every mark is checked as a favicon before it is checked as a lockup — see [the floor](#3-the-floor--measured-not-argued) |

## Adding a package's mark

Every package npm publishes owes the family a mark. `npm run brand -- --check` fails until it
has one, so this is the path, not a suggestion.

### 1. The brief — written before anything is drawn

Three lines, added to "What each mark has to say" above:

1. **The metaphor** — what the package's name means as an object, taken from its intent.
   The name was chosen for its metaphor; the mark draws that object, not the package's API.
2. **Must read as / must not read as** — one of each, as in the
   [commission brief](./commission.md). The "must not" is usually a stock icon or a sibling.
3. **Where the mark rides** — the part of the object that carries the Interlace charge,
   and why that part (a roundel's centre, a page's head, the pull a hand takes).

### 2. The parameters — the whole declaration

A new mark is one entry in `SIBLINGS` in [`scripts/brand.mts`](../../scripts/brand.mts) plus
its share in `MARK_SHARE`. Nothing else is designed per mark; light, outline, bevel,
favicon, lockups and the 3D stage are generated from these.

| Parameter | What it is | Constraint |
| :-- | :-- | :-- |
| `name` | The npm name | Must match a public package |
| `shape` | One SVG path `d`, `evenodd`, in `0 0 100 100` | Closed outlines; a nested subpath is a hole; never burgee's swallowtail |
| `at` | Where the charge rides, in the same box | Centre at least 15 units inside every edge |
| `MARK_SHARE[name]` | Charge size against burgee's own | 0.6 – 1.2 |
| `markings` *(optional)* | Second-colour patches, clipped to the shape | Palette colours only |
| `tagline` | The lockup subtitle | At most 32 characters, one line; says what the object does, not the API |

### 3. The floor — measured, not argued

**Enforced by `--check`** (CI runs it through `npm run lint`):

| Measure | Floor | Why |
| :-- | :-- | :-- |
| Coverage | Every public package has a mark | paratext reached 0.5.0 — four releases — without one, and nothing noticed |
| Charge contrast | Each charge colour ≥ 3:1 on ink (WCAG 2.2 non-text) | A logo has no stylesheet to compensate with |
| Charge share | 0.6 – 1.2 | 0.62 is the smallest share that passed the 16px review; above 1.2 the capsules leave the body |
| Charge inset | ≥ 15 units from every edge | A charge near the edge is cropped by the outline and the favicon mask |
| Palette | Markings use ink, rock, juniper, paper only | The family is one ink; a fifth colour is a different family |
| Swallowtail | Only burgee flies it | A sibling with a swallowtail claims the declaration layer |
| Tagline | ≤ 32 characters | The lockup subtitle is one line |
| Drift | Every generated surface matches the declaration | Generated files are never hand-edited |
| Reach | Package README shows both lockups; root README family row and `brand-stage.tsx` list the mark | Each of these lists has been missed before |

**Reviewed by a person**, because no cheap check measures them. Record the result in the PR:

| Measure | How | Passes when |
| :-- | :-- | :-- |
| 16px legibility | The flag at 16, 32 and 128px on ink and paper, beside the whole family | The silhouette names the object at 16px without the charge |
| Reads as / not as | Show the 128px mark to someone without the name | They name the brief's "reads as", not its "must not" |
| Family fit | The new flag in the root README row | Same weight and density as its neighbours; nothing asks to be looked at twice |
| Three elements, at most | Count silhouette, charge and markings | burgee is one silhouette and one charge; every third element so far made a mark worse |

### 4. Landing it

1. Add the brief, the `SIBLINGS` entry and the `MARK_SHARE` value.
2. `npm run brand` — writes five surfaces per mark.
3. Put the lockup block at the top of the package README (copy any sibling's), and add the
   flag to the root README family row and `MARKS` in `brand-stage.tsx`.
4. `npm run brand -- --check` must be green; attach the review sheet to the PR.

## Where the assets live

Generated marks — flag, favicon, lockups, OG, cover — are projections of one declaration in
[`scripts/brand.mts`](../../scripts/brand.mts), regenerated by `npm run brand` and pinned by
the drift check. Nothing generated should ever be hand-edited.

**Anything that cannot be generated** — a commissioned illustration, a 3D model, a rendered
hero — belongs in the Interlace repository rather than here, because it is shared brand
property and outlives this repo. Each such asset needs its own licence file naming author
and terms beside it; a mark whose licence is "found on the internet" cannot be a trademark.
`burgee/brand` stays the source for everything derivable, and a pinned asset is referenced,
never copied into `brand-assets/`.

## What is still open

- **The caique silhouette is hand-authored.** Its plumage now follows the real bird, which
  carried it a long way, but the outline is still beziers written by hand. If it is ever
  redrawn properly, it is an illustrator's job, pinned as an asset per the rule above.
- **No 3D.** An extruded, lit render was prototyped and rejected: it reads as a sticker with
  a thick shadow, it cannot serve a favicon, and a renderer only lights whatever form it is
  handed. The bevel is the agreed substitute.
