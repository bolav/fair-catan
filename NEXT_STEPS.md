# Next steps

Companion to `TODO.md`, which holds the recovered spec and the reasoning.
This file holds only: where the work stopped, what is needed from outside the
container, and what to do next.

Last updated: 2026-07-29.

---

## State of play

The app is complete and working end to end. Everything in `TODO.md` §4 is built:
board geometry, scoring, the snake draft, CIBI+, the seeded sweep, the Web
Worker, and the React UI (board SVG with the eight drafted settlements and their
roads, CIBI+ hero + meters, per-player breakdown table, physical setup sheet).

Verify in one go:

```
pnpm exec tsc -b     # clean
pnpm test            # 47 passing
pnpm test:e2e        # 10 passing, needs Chromium
pnpm build           # clean
pnpm dev             # serves on 5173, bound to all interfaces
```

Supporting tools:

```
pnpm calibrate [rawBoards] [simBoards] [seed]   # metric maxima + CIBI+/spread distributions
pnpm maximise  [restarts] [steps] [seed]        # hill-climbs each metric to its attainable max
pnpm geometry-check                             # board graph invariants
pnpm render-check [seed]                        # server-renders the board, checks it numerically
node scripts/shoot.mjs [outDir]                 # light/dark screenshots at 1440 and 900
node scripts/zoom.mjs [outDir] [url] [theme]    # high-DPI crops of the board SVG
```

**The UI has now been looked at.** Chromium turned out to be installed at
`/opt/ms-playwright`, so the visual pass finally happened. What it found, and
what was done about it, is in the git log; the short version is that the sea
frame was a lumpy 30-gon rather than six straight pieces, harbour markers were
overlapping terrain names, two frame letters were falling outside the viewBox,
and the frame pieces were being cut out of the coastline one edge late.

`tests/board.spec.ts` now pins all of that in a browser, so it stays fixed.

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
- Playwright resolves browsers via `PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright`.
  Only `@playwright/test` is hoisted into `node_modules`, so import `chromium`
  from there, not from `playwright`.

---

## Needed from outside the container

Nothing outstanding. Both items previously listed here are done: Playwright and
Chromium are installed, and `@types/node` is in devDependencies (the shims it
replaced have been deleted).

The reference material the spec was recovered from — saved copies of the two
articles and their images, plus the frame photo — is kept out of git. See the
README for links to the originals.

---

## Ordered next steps

1. **Re-check our numbers against the reference images.** Our best boards score
   0.044 where the article's best 50 sit at 0.064-0.069. That is expected if
   those PNGs are a *sample* of fair boards; it would mean something is off if
   they are the actual extremes of the article's 100M run. Reading a handful of
   component breakdowns out of the fair-board image and reproducing them
   exactly would settle it. See `TODO.md` §3, "Where our numbers land".

   Note that the `PIECE_START_OFFSET` fix moved every harbour one coastal edge
   round the island, so any previously recorded distributions are stale — rerun
   `pnpm calibrate` before comparing.

2. **`TODO.md` §6 nice-to-haves**, in the order listed there: seed
   import/export as a short string, sliders for the resource relative values,
   and a step-by-step draft animation.

---

## Assumptions currently baked in

Each is a single exported constant, so each is a one-line change.

| assumption | where | note |
|---|---|---|
| Harbour multipliers take the max, not the product (x1.4, never x1.54) | `src/scoring.ts` | articles are silent; max is the conservative reading |
| Robber tax is half the raw pips of the highest-paying hex, applied from the second settlement on | `src/scoring.ts` | `ROBBER_TAX_FRACTION` |
| Normalising divisors are attainable maxima, not 100M-run maxima | `src/fairness.ts` | two of four reproduce the articles' stated values exactly |
| A setup road is worth the best site it reaches, judged at that pick | `src/placement.ts` | `chooseRoad`; roads are not in either article and do not feed CIBI+ |

Resolved:

- The frame pieces can be assembled in **any** order, so searching all 120
  distinct arrangements is correct.
- A frame piece starts on an *inner* coastal node, not an outer one —
  `PIECE_START_OFFSET = -1` in `src/board.ts`. Confirmed against the user's
  physical pieces and independently against the sea frame photo.
- The harbour local offsets within a piece — `{0, 3}` on a 2-harbour piece,
  centre `{2}` on a 1-harbour piece. Confirmed by the user. With the two above,
  the whole sea-frame model is now confirmed rather than assumed.

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
> Start at step 1. Before comparing any numbers, rerun `pnpm calibrate` — the
> harbour positions moved since the last recorded distributions.
>
> Stop if you have questions or things I need to do.
