# Phase-three hint strategies

The twelve strategies below run after the existing twenty-one techniques. Every
detector constructs a named pattern and explains it in Traditional Chinese. None
uses a solved grid or a uniqueness assumption to choose a deduction. A separate
semantic verifier still proves each effect against all completions of the input
candidate model before a hint is displayed.

## Exact supported scope

- **Rectangle Elimination:** a row/column conjugate pair, a perpendicular wing,
  and the fourth-corner box. Assuming the wing forces the opposite conjugate
  endpoint and removes every location for that digit from the fourth box.
  Supports strong/weak and two-strong-link forms. No extended, diagonal, or
  jigsaw variants.
- **X-Cycles:** single-digit alternating strong/weak loops, including continuous
  loops and the elimination at a weak-link discontinuity. At most ten candidate
  nodes including an eliminated discontinuity node. Strong-discontinuity
  placements are not implemented.
- **XY-Chain:** four to eight distinct bivalue cells. Consecutive cells see each
  other and share the linking candidate. The endpoints force the same remaining
  digit into at least one endpoint. Three-cell XY-Wings remain the earlier
  technique; longer or branching XY chains are outside this detector.
- **3D Medusa:** bipartite strong-link components containing both bivalue-cell
  links and same-digit conjugate-house links, up to eighty candidate nodes.
  Supports same-colour contradictions in cells/houses and candidate conflicts
  with both colours (rules 1–5). The cell-emptied-by-colour rule 6 is not
  implemented. Inconsistent components are skipped.
- **WXYZ-Wing:** Type 1, four cells with four total candidates, covered by two
  intersecting units, and exactly one non-restricted candidate. Includes
  row+column as well as line+box forms. Each other digit has mutually visible
  occurrences, so the four cells must use the non-restricted digit. Does not
  claim the newer all-restricted Type 2 extension.
- **Aligned Pair Exclusion:** two mutually visible base cells, enumerating all
  their candidate assignments. A rejected assignment removes two distinct
  digits from a common-peer ALS of one to three cells, leaving too few digits
  to fill that set. Eliminates only base candidates absent from every surviving
  assignment. Non-aligned base pairs and larger ALS witnesses are not included.
- **Grouped X-Cycles:** the X-Cycle rules above with genuine two- or three-cell
  line/box-intersection groups. At least one group is required. A strong group
  link partitions every candidate location of a house; a weak link requires all
  member pairs to see each other. The same ten-node bound applies.
- **Basic AIC:** six to twelve distinct candidate nodes, strong links at both
  ends, containing both a bivalue-cell link and a conjugate-house link. A target
  conflicting with both endpoints is eliminated. No grouped/ALS nodes, forcing
  nets, or strong-discontinuity placements.
- **ALS-XZ:** ALSs of one to four multivalue cells in a single house. Supports
  single restricted-common-candidate XZ eliminations and doubly linked ALS
  eliminations. All occurrences are checked for restricted links, including
  when the sets overlap.
- **ALS-XY-Wing:** three ALSs within the same one-to-four-cell bounds. The
  central ALS connects to the two wings using distinct restricted common
  digits. An external target must see all occurrences of its eliminated digit
  in both wings.
- **Death Blossom:** a stem with two to four candidates and a one-to-four-cell
  ALS petal for each candidate. Every stem branch independently locks a petal
  containing the eliminated digit. Petals may overlap; the target must see all
  occurrences in every selected petal and lie outside the pattern.
- **Sue de Coq:** two or three intersection cells and one to four support cells
  per line/box sector. Supports disjoint candidate partitions inside the
  intersection and generalized support sets whose extra digits may be shared
  outside it. Exact capacity counting locks the appropriate digits in each
  sector. Larger intersections/supports are not searched.

The alternating-chain and XY searches have a deterministic budget of 40,000
extensions per technique call. Reaching a search bound returns no result. This
does not weaken the separate 250,000-node proof budget or the provider's
three-second timeout: an incomplete proof still fails closed.

## Candidate and visibility guarantees

- Auto retains the player's complete current candidate model, including their
  omissions. It does not promote those assumptions into Tidy's trusted ledger.
- Tidy reasons only from the board and independently certified eliminations.
  Missing player notes never establish a link or an ALS.
- Manual still hides the hint controls.
- All new elimination effects intersect the logical candidate masks with the
  currently visible candidates. An ineffective pattern is skipped so another
  instance of that technique can be searched.
- Apply/undo, cancellation, stale fingerprints, proof receipts, history, and
  persistence continue using the existing pipeline without special exceptions.

## Evidence and reproducibility

The numeric regression corpus records original puzzle provenance and includes a
genuine positive for every technique. Its independent Algorithm X oracle
rechecks original uniqueness, candidate legality, and every emitted effect by
searching for a completion containing the opposite result. The oracle is not
imported into the production hint engine. Multi-solution synthetic fixtures also
check that chain deductions do not depend on uniqueness.

See [benchmark instructions and results](phase-three-benchmark.md) for separate
raw detector timings and production browser Worker measurements. A no-result is
not evidence that a technique has no pattern outside its explicit bounds.

## Definitions used

- [Rectangle Elimination](https://www.sudokuwiki.org/Rectangle_Elimination)
- [WXYZ-Wing](https://www.sudokuwiki.org/WXYZ_Wing)
- [Aligned Pair Exclusion](https://www.sudokuwiki.org/Aligned_Pair_Exclusion)
- [X-Cycles](https://www.sudokuwiki.org/X_Cycles)
- [XY-Chains](https://www.sudokuwiki.org/XY_Chains)
- [3D Medusa](https://www.sudokuwiki.org/3D_Medusa)
- [Grouped X-Cycles](https://www.sudokuwiki.org/Grouped_X_Cycles)
- [AIC](https://www.sudokuwiki.org/AIC)
- [HoDoKu ALS definitions](https://hodoku.sourceforge.net/en/tech_als.php)
- [HoDoKu Sue de Coq definition](https://hodoku.sourceforge.net/en/tech_misc.php)
