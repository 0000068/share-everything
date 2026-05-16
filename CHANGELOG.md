# Changelog

All notable changes to this project are tracked here.

## 6.8.0 - 2026-05-16

- Shared CSS color sanitization now accepts conservative CSS Color Level 4 functions.
- `rgb(0 0 0 / 50%)`, `oklch(...)`, and safe `color-mix(...)` values now work across client and server rendering.
- Inline color values still reject style breakouts, `url(...)`, CSS variables, comments, and unbalanced functions.
- Static assets now use the v6.8 cache key for fresh deployed loads.

## 6.7.0 - 2026-05-16

- SSR article template mutation now uses parse5-backed DOM source ranges instead of regex template rewrites.
- Post content, fallback empty-state, head metadata, initial JSON, and structured data insertion share node-based replacement helpers.
- Smoke checks inject parse5 into the CommonJS VM harness so the SSR helpers are exercised without experimental Node flags.
- Static assets now use the v6.7 cache key for fresh deployed loads.

## 6.6.0 - 2026-05-16

- Static metadata injection now uses DOM-based parsing instead of regex rewrites.
- HTML output stays stable while metadata, icons, and preload hints remain synced.
- The metadata tool keeps manifest generation in the same release check path.
- Static assets now use the v6.6 cache key for fresh deployed loads.

## 6.5.0 - 2026-05-16

- SSR article pages now carry nonce-aware CSP only through response headers.
- Static CSP meta remains stable for fallback pages without nonce churn.
- Security policy comments now document why frame ancestors must stay in headers.
- Static assets now use the v6.5 cache key for fresh deployed loads.

## 6.4.0 - 2026-05-16

- Visual checks now compare screenshots against committed golden baselines.
- Reviewers can approve intentional visual changes with a dedicated command.
- Mobile halo coverage now lives in real screenshot diffing instead of CSS text checks.
- Static assets now use the v6.4 cache key for fresh deployed loads.

## 6.3.0 - 2026-05-16

- Metadata escaping now behaves consistently across server rendering and tooling.
- Notion content load-order errors now name the exact missing dependency.
- The shared release checks cover the new HTML escape helper modules.
- Static assets now use the v6.3 cache key for fresh deployed loads.

## 6.2.0 - 2026-05-16

- Server and browser category gradients now handle `calc()` plus signs consistently.
- Project docs now reflect the current check pipeline and smoke-test size.
- Release metadata checks now catch stale FIX_TODO and architecture versions.
- Static assets now use the v6.2 cache key for fresh deployed loads.

## 6.1.0 - 2026-05-15

- Refined the mobile home halo from the v6.0 vertical light column into the requested horizontal glow around the title/search area: CSS `.hero-section::after` now uses a 920px by 500px `ellipse at center` falloff, and the static SVG `centerGlow` uses a user-space horizontal transform instead of a viewport-stretched percentage radial.
- Softened the halo edge while preserving the reference-like blue spread: opacity stops now taper through `0.08` / `0.045` / `0.014` to `transparent 100%`, preventing both the previous vertical beam and a visible oval boundary.
- Updated `scripts/smoke-check/mobile-layout.mjs` so CI protects the horizontal-ellipse contract and fails if the mobile home glow regresses back into a cropped vertical circle.
- Bumped the static CSS/JS/SVG cache key to `20260515-halo-v61` so deployed mobile browsers fetch the corrected halo immediately.

## 6.0.0 - 2026-05-15

- Refined the mobile home scene to match the reference more closely: the CSS hero glow now uses an offscreen 1100px falloff at `57%` with lower opacity stops (`0.08` / `0.04` / `0.018`), and the SVG starfield center glow is dimmed and moved lower so the visible circular spotlight from v5.10 no longer appears.
- Added installable standalone web-app metadata (`manifest.webmanifest`, `display: standalone`, mobile/iOS app-capable meta tags, local MIME handling, and Vercel manifest revalidation) so installed mobile launches can present the intended no-address-bar composition. Normal Chrome browser chrome remains outside page control.
- Hardened release verification across the Node 22/24 GitHub Actions matrix by forcing visual regression CDP traffic through the repo's deterministic WebSocket client.
- Fixed review findings in runtime metadata/cache code: JSON-LD sync now uses the active page CSP nonce, post summary session-cache timestamps are validated before use, and site metadata injection uses literal-safe replacement callbacks.
- Bumped the static CSS/JS/SVG cache key to `20260515-v60` and synchronized `package.json`, README badge, `SITE_ARCHITECTURE.md`, `CHANGELOG.md`, and standalone manifest coverage with the `v6.0` release commit convention.

## 5.10.0 - 2026-05-15

- Dissolved the visible circular disc edge in the mobile home hero glow that v5.9 left behind: CSS `.hero-section::after` width/height 480px → 900px (wider than every supported phone viewport, so the disc boundary falls offscreen), gradient reorganized into 4 smooth stops `rgba(73, 145, 255, 0.2) → 0.11 → 0.05 → transparent 100%` (the prior `transparent 70%` hard cutoff is what created the visible disc).
- Applied the new spotlight identically in BOTH the `@media (max-width: 768px) and (hover: none) and (pointer: coarse)` block AND the `html.is-mobile-device-viewport` fallback block. Earlier fallback drift is now covered by a smoke-check parity contract.
- `scripts/smoke-check/mobile-layout.mjs` now requires byte-exact `background` equality between the two mobile hero blocks and rejects any `transparent` stop below 100%, with a failure message that explicitly names the regression pattern.
- Bumped the static CSS/JS/SVG cache key to `20260515-v510` so deployed clients fetch the wider glow without serving v5.9's narrow disc through the `stale-while-revalidate` window.
- Synchronized `package.json`, README badge, `SITE_ARCHITECTURE.md` (new §2 v5.10 Highlights + v5.9 demoted to §2.1), `CHANGELOG.md`, and the asset cache suffix with the `v5.10` release commit convention.

## 5.9.0 - 2026-05-15

- Completed the mobile home centered glow restoration: SVG `centerGlow` opacities `0.32/0.20` → `0.55/0.32` with the inner stop recolored toward `#3e7bcf`, radius 54% → 60%, focal point cy 59% → 56%; CSS `.hero-section::after` size 360px → 480px, opacities `0.10/0.045` → `0.24/0.11`, top 56% → 54%, now applied in both the `@media (max-width: 768px) and (hover: none) and (pointer: coarse)` block and the `html.is-mobile-device-viewport` fallback block.
- Bumped the static CSS/JS/SVG cache key to `20260515-v59` so deployed clients fetch the synchronized glow without serving stale mobile halo assets through the `stale-while-revalidate` window.
- Removed dead browser-API paths: `navigator.mozConnection` / `webkitConnection`, `nav.msMaxTouchPoints`, the `shouldDisableMobileParticles` wrapper, `particleProfile.disabled` (always equal to `isMobile`), `window.initBlogCardReveal` legacy alias, and the `ParticleCtor` synonym.
- Collapsed wrapper-only functions to `const` aliases: `js/site-utils.js` `resolveDisplayImageUrl` → `sanitizeImageUrl`, `js/notion-content-url.js` `resolveProxiedDisplayImageUrl` → `buildImageProxyUrl`.
- Rewrote `js/blog-page.js` `resolveSafeCoverImage` from a broken-indent triple ternary to a 2-tier explicit-if chain.
- Reorganized `js/ui-effects.js` to expose `window.UIEffects.initBlogCardReveal` in line with the other namespaced runtime modules.
- SSR template contract hardened: `post.html` carries a `data-empty-link` anchor on the empty-state link; `api/post.js` empty-state replacement is attribute-order tolerant; smoke check asserts the postContent placeholder, postEmpty container, and data-empty-link anchor must exist.
- Extended LaTeX coverage to `\mathbb`, `\mathcal`, `\mathfrak`, `\mathbf`, `\mathsf`, `\mathtt`, `\overline`, `\underline`, `\boxed`.
- Fixed service-layer consistency: `server/category-navigation.js` `normalizeCategoryGradient` now accepts `radial-gradient` (matching the client side) and rejects `;` / `url()`; `server/post-service.js` `queryPublicPosts` paginates before decorating; `buildPublicCategories` splits sort and presentation phases instead of building the presentation twice.
- Hardened cache eviction: `js/spa-router.js` `pageCache` adds `MAX_PAGE_CACHE_BYTES=2MB` total + `MAX_PER_ENTRY_CACHE_BYTES=1MB` per-entry size caps with `dropCacheEntry` / `evictOldestCacheEntry` accounting helpers.
- New `scripts/lib/dotenv.mjs` shared parser replaces the duplicated `.env` loaders in `scripts/local-server.mjs` and `scripts/notion-live-check.mjs`.
- `scripts/smoke-check/mobile-layout.mjs` enforces `.hero-section::after` parity (width/height/top/background) between the two mobile blocks and locks the v5.9 brightened opacity.
- Notion icon SVGs (calendar, clock) extracted as `CALENDAR_ICON_SVG` / `CLOCK_ICON_SVG` constants on the shared content module and re-used by both blog cards and article meta rendering.
- Documentation refreshed: `SITE_ARCHITECTURE.md` cache table splits `/api/posts-data` (s-maxage=60), `/api/post-data` (no-store), `/api/sitemap` (s-maxage=300), `/api/robots` (s-maxage=3600) into separate rows and explains the vercel.json header-stacking behavior; `FIX_TODO.md` rewritten to reflect "all 39+4 items landed" with 4 architectural backlog items carried forward.
- Synchronized `package.json`, README badge, `SITE_ARCHITECTURE.md`, `CHANGELOG.md`, and the asset cache suffix with the `v5.9` release commit convention.

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
