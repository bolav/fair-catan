# Fair Catan boards, with starting positions

Generates Catan islands that are *fair*, scores them with CIBI+, and renders
each board together with the simulated opening draft — eight settlements, their
roads, and the cards each player is dealt at setup. The harbours come from a
real six-piece sea frame, so anything generated here can be built on the table.

![The app, showing the best of 20,000 sampled boards: the island with its sea
frame and harbours, the eight drafted settlements with their roads, the CIBI+
score of 0.040 broken down into its five measures, and sliders for the scoring
weights.](media/screenshot.png)

The board above is the best of 20,000 sampled boards, at CIBI+ 0.040 against a
random board's 0.20. Its code is `3KGA-XJQV` — paste that into the app to get
the same island back, sea frame included.

## Running it

```
pnpm install
pnpm dev          # http://localhost:5173
pnpm test         # 54 unit tests
pnpm test:e2e     # 24 browser tests
pnpm build
```

The browser tests need Chromium: `pnpm exec playwright install --with-deps
chromium`. Only `@playwright/test` is a direct dependency, so import `chromium`
from there rather than from `playwright`.

`pnpm-workspace.yaml` sets `verifyDepsBeforeRun: false`, which stops pnpm 11
re-checking the dependency tree before every script. `vite-node` is only a
transitive dependency and has no bin, so the node-side tools run through
`scripts/run-ts.mjs`, which resolves it.

Supporting tools:

```
pnpm calibrate [rawBoards] [simBoards] [seed]   # metric maxima + CIBI+/spread distributions
pnpm maximise  [restarts] [steps] [seed]        # hill-climbs each metric to its attainable max
pnpm geometry-check                             # board graph invariants
pnpm render-check [seed]                        # server-renders the board, checks it numerically
node scripts/shoot.mjs [outDir]                 # light/dark screenshots at 1440 and 900
node scripts/zoom.mjs [outDir] [url] [theme]    # high-DPI crops of the board SVG
node scripts/layers.mjs [outDir] [url] [theme]  # each combination of the Show toggles
node scripts/screenshot.mjs [out] [url] [theme] # regenerates the image above
```

The four `node scripts/…` ones need a dev server running.

## How it fits together

| file | what it holds |
|------|---------------|
| `src/board.ts` | tile/number pools, pips, seeded RNG, pointy-top geometry (54 nodes / 72 edges / 30-edge coastal ring), the 6 frame pieces and their 120 arrangements |
| `src/scoring.ts` | `Tuning` (resource values, resource-access weight, and robber fraction), common location score, player-aware score including bank/harbour access to missing resources |
| `src/placement.ts` | the 1-2-3-4-4-3-2-1 greedy snake draft, each settlement's setup road, each player's opening hand |
| `src/fairness.ts` | fairness measure, the four balance metrics, the normalising divisors, CIBI+ |
| `src/generate.ts` | seeded sweep keeping the best/worst boards, with progress and cancel |
| `src/code.ts` | board codes — the short shareable string for a board |
| `src/copy.ts` | clipboard write with a fallback for insecure contexts |
| `src/worker/sweep.worker.ts` | runs the sweep off the main thread |
| `src/App.tsx`, `src/ui/*` | board SVG, CIBI+ meters, per-player breakdown, scoring sliders, setup sheet |
| `src/tools/*` | `calibrate`, `maximise`, `geometry-check`, `render-check` |
| `tests/board.spec.ts` | Playwright checks on the running app |

A board is determined by one 32-bit seed plus three optional setup locks:
desert in the centre, standard harbour order, and standard A–R number-token
order. Board codes carry both the seed and those lock bits. Throughput is
~3,300 fully simulated boards/s per core, so a 100k sweep takes about 30s in
the worker.

`tests/board.spec.ts` drives the app in Chromium, so the layout is checked
rather than assumed: harbour markers clear of the terrain names, frame letters
inside the viewBox, roads anchored to their own settlement, nothing overflowing
at 1440 or 900, and a clean console.

## What is assumed

The articles do not state every constant. Where one had to be reverse-engineered
or guessed, it is a single exported constant, so each is a one-line change.

| assumption | where | note |
|---|---|---|
| Harbour multipliers take the max, not the product (×1.4, never ×1.54) | `src/scoring.ts` | the articles are silent; max is the conservative reading |
| Robber tax is half the raw pips of the highest-paying hex, from the second settlement on | `src/scoring.ts` | `ROBBER_TAX_FRACTION`, and a slider |
| Normalising divisors are attainable maxima, not 100M-run maxima | `src/fairness.ts` | two of the four reproduce the articles' stated values exactly |
| A setup road is worth the best site it reaches, judged at that pick | `src/placement.ts` | `chooseRoad`; roads are in neither article and do not feed CIBI+ |
| Fairness is the player spread over 15 | `src/fairness.ts` | every published Fairness Board Measure is an exact multiple of 1/150 |
| Missing resources are valued at their maritime conversion rate | `src/scoring.ts` | direct access counts fully; bank 4:1, generic harbour 3:1, and an export resource harbour 2:1 count proportionally |

The sea frame is **not** among these. Piece order, where a piece starts on the
coast (`PIECE_START_OFFSET`) and the harbour offsets within a piece were all
confirmed against the physical pieces this was built for; `src/board.ts`
records how, and why the geometry alone could not settle it.

One thing that looks like a bug and is not: moving the robber slider often does
not change CIBI+ at all. The four balance measures are properties of the board
alone, and the fairness half depends only on the *spread* between players — so
when the tax lands equally on all four, which it does whenever their best hexes
carry the same pips, it cancels out exactly.

## Still to do

- Rerun `pnpm calibrate`, then re-check our numbers against the articles'
  published board images. `PIECE_START_OFFSET` moved every harbour one coastal
  edge round the island, so any previously recorded distribution predates it.
  The open question: our best boards came out *below* the article's best 50
  (0.064–0.069), which is expected if those images are a *sample* of fair
  boards, but would mean something is off if they are the true extremes of its
  100M run.
- A step-by-step draft animation, like the articles' GIFs.

## Credits

The fairness model implemented here is not original. It comes from two articles
by Board Game Analysis, and this project is an implementation of them:

- **[Fair Catan Boards, this time with resources!](https://www.boardgameanalysis.com/fair-catan-boards-this-time-with-resources/)**
  — the CIBI+ index, the resource relative values, and the simulated
  1-2-3-4-4-3-2-1 opening draft that the fairness measure is derived from.
- **[What is a balanced Catan board?](https://www.boardgameanalysis.com/what-is-a-balanced-catan-board/)**
  — the original CIBI index and the four balance sub-metrics CIBI+ reuses:
  resource probability distribution, roll number clustering, resource
  clustering, and harbour return balance.

Please read the originals. They explain the *why* far better than this
implementation's comments do.

The reference material used while building this — saved copies of the two
articles and their images — is not redistributed here. Follow the links above.

*Catan is a trademark of Catan GmbH. This is an unaffiliated fan project.*
