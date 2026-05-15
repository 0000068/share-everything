# Changelog

All notable changes to this project are tracked here.

## 5.7.0 - 2026-05-15

- Rebuilt the mobile home background as a static starfield SVG so it visually restores the richer particle-era look without running the mobile canvas animation.
- Switched the mobile home title to a static cyan-blue-purple gradient with only a one-time entrance animation, avoiding continuous repaint work.
- Compressed `favicon.png` from the 1024px source to the approved 256px browser icon, reducing the mobile critical-path asset from 1.42 MB to 29 KB.
- Added `/assets` cache headers and updated visual/smoke coverage to guard the static mobile starfield, compact favicon, and low-cost mobile title rendering.

## 5.6.0 - 2026-05-15

- Fixed the page-module lazy-loading race by loading the shared Notion rendering chain in dependency order before the blog and post page modules.
- Bumped the static CSS/JS cache key to `20260515-v56` so deployed clients fetch the repaired runtime instead of cached v5.5 assets.
- Synchronized package, README, changelog, and architecture release metadata with the v5.6 release.
- Hardened the smoke check so release version, README badge, architecture version, and asset-version suffix are derived from `package.json` and `js/app.js`.
- Avoided starting page runtime initialization after an initial page module load failure, preserving a clear failure state instead of booting a partially registered page.

## 5.5.0 - 2026-05-14

- Replaced the long HTML script chain with page-specific dynamic imports exposed through `window.PageLoaders`.
- Moved SPA route transitions to load page modules through the shared app entry instead of scanning fetched HTML for script tags.
- Added smoke coverage for the page-loader contract and the single static runtime script per HTML entrypoint.

## 4.7.0 - 2026-05-14

- Hardened the SSR post template pipeline by clearing the cached `templatePromise` on failure and replacing head metadata through explicit `SSR_HEAD_META_*` anchors, with the legacy per-tag regex retained as a fallback.
- Fixed the SPA route HTML cache so successful reads no longer reset `cachedAt`, restoring the intended 5-minute TTL while preserving LRU ordering.
- Allowed `HEAD` requests through `rejectUnsupportedReadMethod` and advertised it in the `Allow` header to align with RFC 9110.
- Replaced `no-store` on `sitemap.xml`, `robots.txt`, and the public posts list with tuned `s-maxage` + `stale-while-revalidate` directives so the edge can absorb crawler traffic without serving stale dynamic pages.
- Replaced the in-place `Symbol`-based search-text cache on post objects with an internal `WeakMap`, removing the input-mutation side effect.
- Consolidated three redundant fix-tracking docs into `FIX_TODO.md` (single source of truth) covering the 7-task plan from the latest cross-review.

## 4.6.0 - 2026-05-14

- Completed the Batch 1-8 repair set and consolidated the remaining fix status into `FIX_TODO.md`.
- Removed client-side `_searchText` generation from public fallback and bookmark paths while keeping server-only search text internal.
- Added server cache/resource safeguards, including bounded block rendering, throttled storage cleanup, serverless-safe cache sweeping, and single-flight failure cooldowns.
- Strengthened release verification with parallel smoke/strict visual checks and Node 18/20/22 GitHub Actions coverage.

## 4.5.0 - 2026-05-13

- Split the Notion server layer into focused client, schema, policy, post, block, cache, and render modules.
- Added a single ES module frontend entry (`js/app.js`) so page templates no longer depend on long HTML script order.
- Added baseline open-source maintenance docs and GitHub issue templates.
- Corrected the browser favicon path to use the approved PNG artwork directly.
- Kept the project positioning explicit: this is a lightweight Notion + Vercel personal blog template in beta.
