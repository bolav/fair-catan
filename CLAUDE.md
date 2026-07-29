# Working in this checkout

The README documents how anyone clones this project and runs it. This file is
about *this particular working copy*, where a few things differ.

## Do not run `pnpm install` here

`node_modules` is pre-installed and the network is firewalled. pnpm 11 decides
the existing install is stale, tries to purge it, and then cannot re-fetch —
which is unrecoverable. `pnpm-workspace.yaml` sets `verifyDepsBeforeRun: false`
to stop it doing this before every script; leave that setting alone.

New dependencies have to be installed from outside, or baked in when the
environment is rebuilt.

(The README tells a reader to run `pnpm install`, which is correct for a fresh
clone. It is only wrong *here*, because the install already exists.)

## Playwright

Browsers are already installed, and resolved through
`PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright`. Only `@playwright/test` is
hoisted into `node_modules`, so import `chromium` from there, not from
`playwright`.

`pnpm test:e2e` and the `node scripts/*.mjs` helpers all need a dev server on
port 5173. `vite.config.ts` binds it to every interface so it is reachable from
outside — which also means it is served over plain HTTP on a LAN address, and
so is **not a secure context**: `navigator.clipboard` does not exist there. See
`src/copy.ts`.

## Verifying a change

```
pnpm exec tsc -b
pnpm test
pnpm test:e2e
pnpm build
pnpm render-check
pnpm geometry-check
```

`pnpm test:e2e --update-snapshots` after an intentional visual change, and look
at the diff before accepting it.
