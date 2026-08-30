# 4. The Pages base path is `/Demiurge/`

- Status: accepted
- Date: 2026-08-30

## Context

The brief specifies `base: '/demiurge/'` in `vite.config.ts`, matching a
repository named `demiurge`. The repository is named `Demiurge`.

GitHub Pages project sites serve from a path derived from the repository name,
and that path is case-sensitive: the site is at
`https://karellopez.github.io/Demiurge/`. A build configured for `/demiurge/`
would emit asset URLs that 404 on the deployed site while working perfectly on
the dev server — the exact failure mode the brief warns about.

Renaming the repository to lowercase was considered and rejected: the display
name "Demiurge" is the product name, and renaming would break the existing
remote for no benefit beyond matching a path literal.

## Decision

`base` is `/Demiurge/`, overridable through the `DEMIURGE_BASE` environment
variable so that alternative static hosts serving from a domain root can build
with `DEMIURGE_BASE=/`.

The Playwright suites run against `vite preview` of the production build at the
real base path, so a hardcoded absolute path fails a test rather than a deploy.

## Consequences

- The deployed site works, which is the point.
- `package.json`'s `name` field remains `demiurge` (lowercase), as npm requires
  and as the brief specifies; only the URL path differs.
- Cloudflare Pages or Netlify deploys need `DEMIURGE_BASE=/`, documented in
  `docs/performance.md` and the workflow file.
