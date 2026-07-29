# Next steps

Companion to `TODO.md`, which holds the recovered spec and the reasoning.
This file holds only: where the work stopped, what is needed from outside the
container, and what to do next.

Last updated: 2026-07-29.

---

## State of play

The app is complete and working end to end. Everything in `TODO.md` §4 is built:
board geometry, scoring, the snake draft, CIBI+, the seeded sweep, the Web
Worker, and the React UI (board SVG with the eight drafted settlements, CIBI+
hero + meters, per-player breakdown table, physical setup sheet).

Verify in one go:

```
pnpm exec tsc -b     # clean
pnpm test            # 39 passing
pnpm build           # clean
pnpm dev             # serves on 5173, bound to all interfaces
```

Supporting tools:

```
pnpm calibrate [rawBoards] [simBoards] [seed]   # metric maxima + CIBI+/spread distributions
pnpm maximise  [restarts] [steps] [seed]        # hill-climbs each metric to its attainable max
pnpm geometry-check                             # board graph invariants
pnpm render-check [seed]                        # server-renders the board, checks it numerically
```

**The one thing never verified: nobody has looked at the running app.** There is
no browser in this container. `pnpm render-check` proves the SVG has 19 hexes,
18 number tokens, 9 harbours, 8 settlements and 6 frame letters, and that no
harbour label collides in any of the 120 frame arrangements — but that is
structure, not appearance. Layout, spacing, dark mode, and the whole right-hand
column are unreviewed.

---

## Environment rules — read before running anything

- **Never run `pnpm install` in this container.** pnpm 11 decides the baked
  `node_modules` is stale and tries to purge it; the network is firewalled, so
  that is unrecoverable. `pnpm-workspace.yaml` sets `verifyDepsBeforeRun: false`
  to stop it doing this before every script. Leave that setting alone.
- New dependencies have to be installed from outside the container, or by
  rebuilding the image with `pnpm install` at build time.
- `vite-node` is only a transitive dependency and has no bin, so the node-side
  tools run through `scripts/run-ts.mjs`, which resolves it.

---

## Needed from outside the container

### 1. Playwright + Chromium — the real blocker

Without a browser the UI cannot be reviewed, screenshotted, or regression-tested.

```
pnpm add -D @playwright/test
pnpm exec playwright install --with-deps chromium
```

ImageMagick 6.9 is present but aborts parsing the board SVG, so rasterising is
not a workaround. `rsvg-convert` would be a lighter alternative if a full
browser is unwanted, but it only solves the board, not the dashboard.

### 2. `@types/node` — minor

```
pnpm add -D @types/node
```

Then delete `src/tools/node-shims.d.ts` and the two `declare const process`
lines in `src/tools/calibrate.ts` and `src/tools/maximise.ts`.

---

## Ordered next steps

1. **Visual pass on the app.** Screenshot light and dark mode at desktop and
   ~900px width. Look for: label collisions in the board SVG, the sea-frame band
   being wide enough for the 54x22px harbour markers, meter and table alignment,
   and whether the two-column layout collapses sensibly. Fix what it turns up.
   This is the highest-value step — it is the only part of the build with no
   verification behind it.

2. **Screenshot test.** Once Playwright is in, add a test that loads a fixed
   seed and snapshots the board, so board rendering stops being unverifiable.

3. **Confirm the harbour phase on the physical frame.** Lay the six pieces in
   the standard alternating order (B, A, C, D, E, F) and check the harbours land
   on the classic 3-4-3 gaps. If they don't, the `{0, 3}` local-edge assumption
   in `FRAME_PIECES` (`src/board.ts`) is off by a step and every non-alternating
   arrangement the generator picks would be wrong on the table. See `TODO.md`
   §3.1.

4. **Re-check our numbers against the reference images.** Our best boards score
   0.044 where the article's best 50 sit at 0.064-0.069. That is expected if
   those PNGs are a *sample* of fair boards; it would mean something is off if
   they are the actual extremes of the article's 100M run. Reading a handful of
   component breakdowns out of the fair-board image and reproducing them
   exactly would settle it. See `TODO.md` §3, "Where our numbers land".

5. **`TODO.md` §6 nice-to-haves**, in the order listed there: seed
   import/export as a short string, sliders for the resource relative values,
   and a step-by-step draft animation.

---

## Assumptions currently baked in

Each is a single exported constant, so each is a one-line change.

| assumption | where | note |
|---|---|---|
| Harbour multipliers take the max, not the product (x1.4, never x1.54) | `src/scoring.ts` | articles are silent; max is the conservative reading |
| Robber tax is half the raw pips of the highest-paying hex, applied from the second settlement on | `src/scoring.ts` | `ROBBER_TAX_FRACTION` |
| Within a 2-harbour piece the 3:1 sits at local edge 0, the 2:1 at local edge 3 | `src/board.ts` | from the left-to-right reading of `TODO.md` §3.1's table |
| Normalising divisors are attainable maxima, not 100M-run maxima | `src/fairness.ts` | two of four reproduce the articles' stated values exactly |

Resolved: the frame pieces can be assembled in **any** order, so searching all
120 distinct arrangements is correct.

---

## Restart prompt

Paste this to pick the work back up:

> Continue the fair-Catan board generator in `/workspace`. Read `NEXT_STEPS.md`
> first — it has the current state, the environment rules, and an ordered task
> list; `TODO.md` has the recovered spec behind it.
>
> Critical: never run `pnpm install` in this container, it will destroy
> `node_modules` unrecoverably.
>
> Check whether Playwright and Chromium are installed
> (`pnpm exec playwright --version`). If they are, start at step 1: run the app,
> screenshot it in light and dark mode at desktop and narrow widths, and fix
> whatever the visual pass turns up — the UI has never been looked at. If they
> are not installed, tell me and start at step 3 instead.
>
> Stop if you have questions or things I need to do.
