# Changelog

All notable changes to this project are tracked here.

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
