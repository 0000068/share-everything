# Changelog

All notable changes to this project are tracked here.

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
