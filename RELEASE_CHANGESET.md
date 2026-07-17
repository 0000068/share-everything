# Release Changeset

Updated: 2026-07-17
Target: v8.6.0 (unreleased)

## Scope

This working tree is one release-sized performance, request-lifecycle, accessibility, and executable-quality change set. The dedicated Notion publishing database remains intentionally public.

### 1. Runtime performance and lifecycle

- `api/image.js`, `api/cover.js`, `api/post.js`, `api/post-data.js`, `api/posts-data.js`
- `server/request-lifecycle.js`, `server/notion-client.js`, `server/block-service.js`, `server/post-service.js`
- `js/blog-bootstrap.js`, `js/app.js`, `js/spa-router.js`, `js/notion-api.js`, `js/blog-page.js`, `js/post-page.js`, `js/bookmark.js`
- `scripts/local-server.mjs`

### 2. Executable quality gates and tests

- `scripts/architecture-check.mjs`, `scripts/build-mobile-fallbacks.mjs`, `scripts/inject-site-meta.mjs`, `scripts/stamp-asset-version.mjs`
- `scripts/smoke-check.mjs`
- Focused request, router, tooling, local-server, image, public-content, and API contract modules under `scripts/smoke-check/`
- `scripts/visual-regression.mjs`
- `.github/workflows/release-check.yml`

### 3. Release metadata and documentation

- `package.json`, `package-lock.json`, `.env.example`, `.gitattributes`
- Runtime asset keys in HTML, CSS, and `js/app.js`
- `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `FIX_TODO.md`, `SITE_ARCHITECTURE.md`

## Behavioral Summary

- External font requests are removed; the blog listing request starts before its rendering modules, and blog/post dependency chains are preloaded per page. The blog path no longer downloads the article renderer or full block-rendering module.
- SPA transport and preparation deadlines are independent. Page loaders receive cancellation context; network failure retains the current page with an accessible retry, while version/structure/preparation failures use one deduplicated hard navigation to avoid cross-deployment DOM/runtime mixes. Warmup rejects prefix-lookalike origins/current-page requests.
- Browser shared requests, server Notion traversal, and image transport propagate cancellation and use total operation budgets.
- Browser public-content and early-bootstrap budgets are synchronized at 35 seconds, above the server's complete 30-second Notion operation deadline, preventing valid cold traversals from being cancelled before they can populate caches.
- Successful article HTML/JSON uses a five-minute edge cache with ten-minute stale revalidation; failures remain `no-store`.
- Signed image/cover routes enforce canonical raw query ordering and encoding. Cover width and format are both explicit, and the endpoint neither negotiates `Accept` nor emits `Vary: Accept`, so equivalent URLs cannot multiply CDN misses and origin/Sharp work.
- Valid Notion page ids converge to one lowercase compact representation across HTML redirects, data URLs, shared requests, caches, and bookmarks; noncanonical data queries fail before upstream work.
- Bookmark cover signatures refresh independently every 30 minutes, retry failed/partial work with bounded backoff, resume immediately online, and resolve cross-tab races by metadata freshness.
- Single-flight/cache writes preserve causal ordering after cancellation; category base pages are reused across local searches; sitemap and the local server share real request-lifecycle semantics.
- Only one real cover candidate is eager/high/preloaded. Article media preserves source dimensions when both are known, never fabricates a fallback aspect ratio, and reduced-motion/contrast/target-size contracts are enforced.
- Particle work is disabled for narrow, reduced-motion, and save-data clients and otherwise adapts through bounded 350 / 220 / 120 tiers from hardware and measured frame cost.
- Static JS/CSS/assets use immutable caching and a deterministic content-derived cache key.

## Architecture and Quality Summary

- The architecture checker now includes `import(versioned(...))` edges as well as literal module imports.
- Generator-owned CSS and HTML ranges have explicit unique start/end markers; hand-written content outside those ranges is preserved.
- Smoke recomputes the shipped asset fingerprint, starts the real local server, verifies PWA image metadata, and exercises router/request cancellation behavior.
- The local API adapter forwards raw URLs and request disconnect state, and real-HTTP smoke proves noncanonical list queries are rejected exactly as in deployment.
- Visual regression uses deterministic real blog and full-article fixtures on mobile and desktop rather than synthetic card-only markup. Each CDP scenario polls a bounded semantic readiness contract, requires representative card reveals to finish, waits at most four seconds for finite CSS animations/transitions, proves live desktop motion, then seeds visual-only randomness and fixes infinite CSS animation phase for pixel capture. It fails strict runs on timeout and closes Chrome gracefully before profile cleanup. Baseline generation requires three samples with no pairwise diff above 0.25% and transactionally replaces all seven PNGs with rollback on partial failure.
- CI tests the exact Node 22.13.0 lower boundary and Node 24, then runs a strict Linux Chrome structure/behavior contract. Local release verification retains Windows pixel baselines for all seven shared scenarios and fails closed if any is absent. Workflow permissions are read-only, checkout credentials are not persisted, and reviewed action releases are full-SHA pinned.
- Package publishing is disabled with `private: true`; runtime and tooling dependencies are exact and current at audit time. CI activates the declared `npm@11.9.0`, and `.webmanifest` files are normalized to LF so the asset fingerprint is cross-platform reproducible.

## Suggested Review Order

1. Browser bootstrap, SPA deadlines, cancellation, and one-cover priority.
2. Server operation lifecycle, image disconnect handling, and public post caching.
3. Immutable asset fingerprint and generator marker boundaries.
4. Behavior tests, real-server/visual fixtures, lint, architecture gate, and CI.
5. Version, environment documentation, release notes, and final validation evidence.

## Validation Status

Completed against the local v8.6 working tree on 2026-07-17:

```powershell
npm.cmd run assets:sync
npm.cmd test
npm.cmd run verify:release
npm.cmd audit --audit-level=low
npm.cmd audit --omit=dev
npm.cmd outdated --long
npm.cmd ci --dry-run
git diff --check
```

`npm.cmd test` and strict seven-scenario `npm.cmd run verify:release` passed; both dependency audits reported zero vulnerabilities; `npm.cmd outdated --long` returned no outdated packages; lockfile dry-run and a clean `npm.cmd ci` completed; and `git diff --check` reported no patch-format errors. The final release gate is rerun after documentation is frozen so this evidence covers the delivered bytes.

v8.6 remains an uncommitted local working tree. It has not been pushed or deployed, and this document makes no branch-divergence or `origin/main` claim.
