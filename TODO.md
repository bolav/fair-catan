# Fair Catan boards with starting positions — implementation TODO

Goal: generate Catan islands that are *fair* in the sense of
"Fair Catan Boards, this time with resources!" (see README for the link), and
render each board **together with the simulated starting settlements** that the
fairness measure is derived from.

Sources — see README for links; the material itself is not redistributed here:
- **"Fair Catan Boards, this time with resources!"** — the fairness simulation,
  CIBI+, and the resource relative values.
- **"What is a balanced Catan board?"** — the original CIBI index; **defines the
  four balance sub-metrics** CIBI+ reuses.
- The 50-scored-board images published with the articles (a fair set and an
  unfair set), used below to reverse-engineer the constants they never state.
- A photo of the user's own 6 sea-frame pieces (§3.1).

---

## 0. Environment — resolved

`node_modules` is now baked into the image; `vite`, `vitest`, `react` and
`typescript` all run. Two things had to change to keep it that way:

- `pnpm-workspace.yaml` sets `verifyDepsBeforeRun: false`. pnpm 11 otherwise
  runs `pnpm install` before every script, decides the baked install is stale,
  and tries to **purge `node_modules`** — which the firewall makes unrecoverable.
  It also answers the `allowBuilds: esbuild` prompt that was left as a
  placeholder (`true` — esbuild's postinstall links its native binary).
- Do **not** run `pnpm install` in this container.

`vite-node` is only a transitive dependency, so it has no bin. `scripts/run-ts.mjs`
resolves it and is what `pnpm calibrate` / `maximise` / `render-check` /
`geometry-check` run through.

Still missing, and worth installing if a rebuild happens anyway:

- `@types/node` — the two node-only tools declare a one-line `process` shim instead.
- a headless browser (Playwright + Chromium) — there is no way to *look* at the
  running app from in here. `pnpm render-check` server-renders the board and
  checks it numerically as a stand-in; ImageMagick 6.9 aborts trying to
  rasterise the SVG, so it is not a substitute.

---

## 1. What exists

| file | what it holds |
|------|---------------|
| `src/board.ts` | tile/number pools, pips, seeded RNG, pointy-top geometry (54 nodes / 72 edges / 30-edge coastal ring), the 6 frame pieces and their 120 arrangements |
| `src/scoring.ts` | resource values, common location score, player-aware score (harbour multipliers, number/resource bonuses, robber tax) |
| `src/placement.ts` | the 1-2-3-4-4-3-2-1 greedy snake draft under the distance rule |
| `src/fairness.ts` | fairness measure, the four balance metrics, the normalising divisors, CIBI+ |
| `src/generate.ts` | seeded sweep keeping the best/worst boards, with progress and cancel |
| `src/worker/sweep.worker.ts` | runs the sweep off the main thread |
| `src/App.tsx`, `src/ui/*` | board SVG, CIBI+ hero + meters, per-player breakdown, physical setup sheet |
| `src/tools/*` | `calibrate`, `maximise`, `geometry-check`, `render-check` |

Scripts: `pnpm dev` · `pnpm test` · `pnpm build` · `pnpm calibrate` ·
`pnpm maximise` · `pnpm render-check` · `pnpm geometry-check`.

---

## 2. Spec recovered from the article (confirmed)

### 2.1 Resource relative values
From the resource values table ("average expected cost of the top 50 fastest
victories"):

| resource | value |
|----------|-------|
| wheat    | 1.350 |
| ore      | 1.329 |
| wood     | 0.781 |
| brick    | 0.781 |
| sheep    | 0.760 |

### 2.2 Expected card return (pips per 36 rolls)
`2→1, 3→2, 4→3, 5→4, 6→5, 8→5, 9→4, 10→3, 11→2, 12→1`; desert → 0.

### 2.3 Location (intersection) score
```
hexValue      = expectedCardReturn × resourceRelativeValue
locationScore = Σ hexValue over the (up to 3) adjacent hexes
```
The static right-hand list in the article's GUI uses this common valuation;
the *player-specific* value adds the modifiers below.

### 2.4 Player score modifiers
- **Harbour multiplier** — settling on a harbour multiplies the player's score
  for the affected resource(s): `1.4` for a 2:1 resource harbour (that resource
  only), `1.1` for a 3:1 generic harbour (all resources).
  Consequence: *location values become player-dependent*.
- **Number bonus** — `+0.3` per distinct roll number the player has settled
  (max `+0.9` per settlement).
- **Resource bonus** — `+0.31` per distinct resource the player has settled
  (max `+0.93` per settlement). Deliberately slightly above the number bonus.
- **Robber tax** — subtract **half** the expected card return of the player's
  highest-paying hexagon. Applied **only when placing the second settlement**.

### 2.5 Placement simulation
Snake draft `1-2-3-4-4-3-2-1`. Each player greedily takes the highest-scoring
location still legal for them (distance rule: no settlement within 2 road
lengths of another). Player-specific valuation means the "best" spot differs
per player on the second round.

### 2.6 Fairness Measure — reverse-engineered from the reference images
Every `Fairness Board Measure` value in the fair-board image and
the unfair-board image is an exact multiple of `1/150` (0.047 = 7/150,
0.833 = 125/150, 0.760 = 114/150, 0.673 = 101/150 …). That is consistent with:

```
fairness = clamp((maxPlayerScore − minPlayerScore) / 15, 0, 1)
```
with player scores rounded to 1 decimal (spread moves in 0.1 steps → 0.1/15 =
1/150). Fair boards show spreads of ~0.2–1.0 points; the worst boards ~11–12.5.

**✔ Confirmed by the simulation.** Over 20k simulated boards the spread runs
p0 0.06 / p50 2.43 / p99 7.20 / p100 11.66, with player totals averaging 22.1.
Both ends line up with the reference images: their fair boards sit around the
5th percentile of our spread and their worst around our maximum, so /15 is the
right divisor and never clamps in practice.

### 2.7 CIBI+ index — confirmed exactly
```
CIBI+ = ( mean(RPD, RollNumberClustering, ResourceClustering, HarborReturnBalance)
          + FairnessMeasure ) / 2
```
Verified against many samples in both PNGs, e.g. `(0.085+0.000+0.200+0.084)/4`
averaged with `0.047` → `0.069` ✓; `(0.376+0.667+0.700+0.162)/4` with `0.760`
→ `0.618` ✓.

**Lower is better.** Best 50 boards land at `0.064–0.069`; worst 50 at
`0.44–0.62`.

CIBI 1.0 had **six** measures; CIBI+ keeps four. The two dropped ones are
"resource distribution on the island" and "probability distribution on the
board" — both of which needed the three island-dividing mirror lines.
**So we never have to implement the dividing-line geometry.**

### 2.8 The four balance sub-metrics (from the "What is a balanced Catan board?" article)

All four are "raw score, then divided by the highest value seen over a huge
random run" — so each lands in 0.0–1.0 but may slightly exceed 1.0.

1. **Resource Probability Distribution** — per resource, sum the pips over its
   tiles. Expected share is proportional to tile count out of 58 total pips:
   `4×58/18 = 12.889` (wood/sheep/wheat), `3×58/18 = 9.667` (brick/ore). Score
   = Σ (actual − expected)². Raw minimum is ~1.0, never 0, because the expected
   values aren't integers.
2. **Roll Number Clustering** — `+5` for every edge shared by two hexes with
   the same number. Article states the max is **30** (only 3-4-5-9-10-11 can be
   adjacent, since 6-6 and 8-8 are illegal → 6 pairs × 5).
   ✔ Confirms the k/6 quantization in the renders: `5/30 = 0.167`.
3. **Resource Clustering** — `+5` for every edge shared by two hexes of the
   same resource. Max isn't stated, but the renders are always multiples of
   0.05, which pins the normalizing divisor at **100** (raw multiples of 5).
4. **Harbor Return Balance** — per harbour: for each of its two connected
   settlement positions, sum the pips of that position's adjacent hexes, with
   hexes **matching the harbour's resource type counted double**; the harbour's
   score is the **max** of its two positions. Then take the **sum of squared
   deviations from the mean** of the 9 harbour scores (the article keeps the
   sum, not the variance — divide by 9 for the true variance).

**✔ Divisors settled.** `cibi.txt` says the divisor is "the highest value
obtained on a 100 million board run". `pnpm maximise` hill-climbs each metric to
its *attainable* maximum instead, and the result validates the method: two of
the four come out exactly as the articles state them.

| metric | divisor | source |
|--------|---------|--------|
| resource probability distribution | **115.259** = 9336/81 | search; pips `{5,5,5,5} {4,4,4,4} {1,1,2,2} {2,2,3} {3,3,3}` |
| roll number clustering | **30** | search — matches the article's stated max |
| resource clustering | **100** | search — matches the 0.05 render quantization |
| harbor return balance | **492.889** = 4436/9 | search |

A 15M-board random sweep reaches 113.3 / 30 / 95 / 396, approaching these from
below as expected.

The `≈39` guess for the resource probability divisor did **not** hold up: that
metric steps in units of 1/9 (raw = (81·Σa² − 18·Σaᵢeᵢ·9 + 55506)/81, always
≡ 1 mod 3 over 27), so the ~1/117 quantization read off the renders would imply
a divisor of 13, which is impossible — 13 would put most boards far above 1.0.

---

## 3. Open questions / assumptions to resolve

1. **Harbour freedom is constrained by the physical set — DECIDED.**
   The boards will be built with a **5th-edition-style sea frame that has the
   harbours printed on its 6 pieces**. So the generator may *not* freely
   permute harbour types: it searches over **arrangements of the 6 frame
   pieces**, with each piece's harbours fixed to it.
   - Positions: the standard 9 slots, spaced **3-3-4** around the 30 coastal
     edges. This is consistent both with the "What is a balanced Catan board?" article's rule that no
     settlement position may touch two harbours, and with the physical frame
     (three pieces carry 2 harbours, three carry 1 → 3×2 + 3×1 = 9).
   - Search space: 6! = 720 piece orders, but a whole-ring rotation is
     equivalent to rotating the land, which tile randomization already covers →
     **120 meaningfully distinct frame configurations**.
   - Arbitrary piece orders stay legal: two harbours across a seam end up ≥2
     edges apart, so they never share an intersection.
   - **The UI must output the frame piece order**, otherwise a generated board
     can't be physically reproduced.

   **The user's actual frame** (read off the sea frame photo, six pieces laid
   out top to bottom). All six pieces are the same shape — same left notch,
   same right tab — so any piece fits any of the 6 ring slots:

   | piece | harbours | layout |
   |-------|----------|--------|
   | A | wood 2:1 | single, centred |
   | B | 3:1 + wheat 2:1 | pair, inset from each end |
   | C | 3:1 + brick 2:1 | pair |
   | D | ore 2:1 | single, centred |
   | E | 3:1 + sheep 2:1 | pair |
   | F | 3:1 | single, centred |

   Totals check out: 4× generic 3:1 (B, C, E, F) and one 2:1 per resource
   (A wood, B wheat, C brick, D ore, E sheep) = 9. ✔
   Each 2-harbour piece pairs a 3:1 with a resource 2:1; the three 1-harbour
   pieces are wood 2:1, ore 2:1 and 3:1.

   Model: a piece spans **5 coastal edges** (2 edges of a corner hex + 2 of the
   edge hex + 1 of the next corner hex — 6×5 = 30 ✔). 2-harbour pieces carry
   their harbours 3 edges apart; 1-harbour pieces carry theirs centred. The
   standard alternating order 2,1,2,1,2,1 then reproduces the classic ring of
   gaps 3,4,3,3,4,3,3,4,3.

   - ✔ **Assembly order — confirmed by the user: the pieces can be assembled any
     way.** So the generator searching all 120 distinct arrangements is correct,
     and the setup sheet's piece order is a real instruction, not a suggestion.
   - ✔ **Where a piece starts on the coast — confirmed by the user.** Six
     consecutive coastal edges share one straight midline and a piece takes
     five of them, so there are two ways to cut a piece out of the ring and
     both give a straight bar. Geometry cannot choose; the physical pieces can.
     Read from the left, a piece's inner profile runs **low, high, low, high,
     low, high**, which is one edge earlier than the ring walk's own start —
     `PIECE_START_OFFSET = -1` in `src/board.ts`. The photo agrees
     independently: it puts the steep joint on a piece's left end and the
     shallow one on its right, and only the -1 cut does that (offset 0 is the
     mirror image). This rotates all nine harbours one coastal edge round the
     island, so it changes scoring; it leaves the 3-4-3 gap pattern alone,
     which is why the gap check alone could never have caught it.
   - ✔ **Local edge index of each harbour — confirmed by the user.** `{0, 3}`
     on a 2-harbour piece, centre `{2}` on a 1-harbour piece. This is relative
     to the piece itself, so the start offset above does not disturb it.
2. **Robber tax detail — implemented as read.** "highest paying hexagon" is the
   single adjacent hex with the largest expected card return across the player's
   settlements; the tax is half its raw pips, applied once the player holds two
   settlements.
3. **Fairness divisor of 15** (§2.6) — ✔ confirmed, see above.
4. **Harbour multipliers do not compound — assumed.** A player holding both a
   3:1 and a 2:1 for the same resource gets ×1.4, not ×1.54. The articles do not
   say; taking the max is the conservative reading. One exported constant each,
   so this is a one-line change.
5. **Order within a 2-harbour frame piece — ✔ confirmed by the user.** §3.1's
   table lists each pair as "3:1 + resource 2:1", read left-to-right, so the
   3:1 sits at local edge 0 and the 2:1 at local edge 3; 1-harbour pieces carry
   theirs centred at local edge 2. Together with `PIECE_START_OFFSET` this
   makes the whole frame model confirmed rather than assumed.
6. **Setup roads — a heuristic, not from the articles.** Neither article covers
   roads; the app places one per settlement because you cannot set a board up
   without them. A setup road is treated as an option on a future settlement
   and scored by the best site it reaches (`chooseRoad` in
   `src/placement.ts`) — common location score only, judged against the board
   as it stands at that pick. It does not feed CIBI+.

### Where our numbers land vs the articles

Over 20k simulated boards CIBI+ runs p0 0.044 / p50 0.193 / mean 0.200 /
p100 0.531. The article's worst 50 (0.44–0.62) matches our top end. Our best
boards come in *below* its best 50 (0.064–0.069) — expected if those images are
a sample of fair boards rather than the global optimum of its 100M run, since a
20k sweep already finds spreads under 0.1. Worth re-checking if the two PNGs
turn out to be the extremes rather than a sample.

---

## 4. Implementation plan — done

All of the below is built, typechecked, tested (39 vitest tests) and builds.
Throughput is ~3,300 fully simulated boards/s per core, so a 100k sweep takes
about 30s in the worker; ~88,000/s for the layout-only metrics.

- [x] **`src/board.ts`** — extend: pip table, pointy-top pixel geometry
      (`x = size·√3·(q + r/2)`, `y = size·1.5·r`), intersection (node)
      derivation by rounding hex corner coordinates and de-duplicating,
      node↔hex and node↔node adjacency, coastal ring extraction, the 9 fixed
      harbour slots (3-3-4), the 6 frame pieces and their arrangements
      (§3.1), seeded RNG so boards are reproducible/shareable.
- [x] **`src/scoring.ts`** — pip values, resource values (§2.1 — single
      exported constant, easy to retune), static location score, player-aware
      location score (harbour multipliers, number/resource bonuses, robber tax).
- [x] **`src/placement.ts`** — the `1-2-3-4-4-3-2-1` snake draft, distance rule,
      returns per-player settlements plus a full score breakdown per resource
      (mirrors the article's GUI table).
- [x] **`src/fairness.ts`** — Fairness Measure (§2.6) + the four balance
      components (§2.8) + `CIBI+` (§2.7). Keep the normalizing divisors in one
      exported constant.
- [x] **`src/generate.ts`** — generate N boards with a seeded RNG, score each,
      keep the best by CIBI+ (and a "worst" mode for comparison). Must stay
      fast enough to sweep ≥100k boards in a Web Worker. Also use a long sweep
      once to calibrate the §2.8 divisors, then hardcode them.
- [x] **`src/main.tsx` + components** — built as `App.tsx` plus `src/ui/`.
      Board SVG in the style of the reference renders: hexes with resource
      colours, number tokens with pip dots (red for 6/8), harbours on the sea
      ring, **the 8 starting settlements drawn in player colours**, plus the
      per-player score breakdown and the CIBI+ breakdown bars. Must also render
      a **physical setup sheet** — frame piece order first, then tile and
      number-token placement — so the board can actually be built on the table.
- [x] **Tests** (`vitest`): pool integrity, no adjacent 6/8, 54 nodes / 72
      edges on the standard layout, distance rule never violated by the draft,
      8 settlements placed, fairness ∈ [0,1], CIBI+ recomposition matches
      §2.7, seeded generation is deterministic, no intersection touches two
      harbours, roll-number clustering never exceeds its stated max of 30.
- [x] **Verify** `pnpm test`, `pnpm build`, and `pnpm dev` (port 5173, already
      bound to all interfaces in `vite.config.ts`).

---

## 5. Calibration references

- CIBI 1.0 (six measures) over 100M random boards: mean **0.243**, sd
  **0.056**. Not directly comparable to CIBI+, but a useful order-of-magnitude
  check on our normalized components.
- the "What is a balanced Catan board?" article scores the rulebook beginner island and a 2016 CatanCon
  tournament board (top 0.2%); the "Fair Catan Boards" article scores the 2020 Canadian
  championship board. Good regression fixtures if we transcribe them.
- The 100 boards in the two PNGs come with full component breakdowns — the best
  available end-to-end check that our numbers reproduce the article's.

---

## 6. Nice to have (only after the above)

- Import/export a board as a short seed string.
- Slider UI for the resource relative values (the article invites exactly this).
- "Show the draft step by step" animation, like the article's GIFs.
