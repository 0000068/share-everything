# Share Everything Site Architecture

> Version: v7.5
> Updated: 2026-05-16

## 1. Overview

Share Everything is a small static-first site with Notion as the content source, Vercel Serverless Functions as the public content layer, and vanilla HTML/CSS/JS on the frontend.

It is not a React, Next.js, Vue, Cloudflare Workers, or Cloudflare Pages app. Cloudflare only handles DNS.

| Layer | Technology | Responsibility |
|---|---|---|
| Content source | Notion API | Article metadata and block content |
| Server | Vercel Serverless Functions | Public list API, post data API, SSR post HTML, robots, sitemap, image proxy |
| Frontend | Vanilla HTML/CSS/JS | Static entry pages plus lightweight SPA navigation |
| DNS | Cloudflare | DNS only |
| Bookmarks | `localStorage` | Fully local bookmark storage |

```text
Notion Database
  -> Notion API
    -> Vercel Serverless Functions
      -> /api/posts-data
      -> /api/post-data
      -> /api/post
      -> /api/image
      -> /api/robots
      -> /api/sitemap
        -> Browser
          -> Static HTML shell
          -> Lightweight SPA navigation
          -> localStorage bookmarks
```

## 2. Version v7.5 Highlights

v7.5 simplifies the mobile overview bottom dock and tightens the card grid aspect, both strictly mobile-scoped — no desktop CSS changed.

- `css/style.css` `body[data-page="blog"] .top-actions` is stripped of its container tray (gradient backplate, drop shadow, double border all removed). Each `.action-btn` is now a standalone `返回列表`-style pill: soft white gradient (`rgba(255,255,255,0.07)` → `rgba(255,255,255,0.035)`), thin cyan border (`rgba(137,224,255,0.16)`), single inset highlight, no outer shadow.
- `body[data-page="blog"] .action-btn.active` switches from cyan-saturated highlight to a slightly brighter neutral pill so the active state matches the surrounding pills' visual weight.
- `css/blog-page.css` `.blog-card` mobile aspect-ratio drops from `1 / 1` to `1 / 0.86` so the 2-column card grid takes ~14% less vertical space; `grid-template-rows` rebalanced to `0.6fr / 0.4fr` for the cover-vs-body split.
- Both the `@media` block and the `html.is-mobile-device-viewport` fallback receive both changes via `mobile:fallbacks` derivation.
- Static CSS/JS/SVG entry URLs use the `20260516-v75` cache key so deployed browsers fetch the refreshed mobile UI promptly.

## 2.1 Version v7.4 Highlights

v7.4 retunes the mobile home center glow to a softer, more cyan-tinted halo that wraps the title area without over-saturating it. Strictly mobile-scoped — desktop hero rendering is untouched.

- `assets/mobile-home-starry-bg.svg` shifts the `centerGlow` and `titleGlow` colors toward teal (`#46a4d4` / `#54b8d8`) at reduced opacity stops, and lifts both gradients upward so they envelop the title area rather than sitting under the search box.
- `css/style.css` mobile `.hero-section::after` adopts the same softer cyan stops (peak `rgba(72, 168, 210, 0.20)` instead of the prior brighter pure blue) and a slightly smaller 980×600 footprint to keep the halo contained.
- Both the `@media (max-width: 768px) and (hover: none) and (pointer: coarse)` block and the `html.is-mobile-device-viewport` fallback receive the change — no desktop `.hero-section::after` exists, so PC rendering is identical to v7.3.
- The mobile home visual baseline is refreshed (`scripts/visual-baselines/mobile-home.png`). The desktop baseline is intentionally not regenerated since the desktop view did not change.
- Static CSS/JS/SVG entry URLs use the `20260516-v74` cache key so deployed browsers fetch the refreshed glow promptly.

## 2.1 Version v7.3 Highlights

v7.3 focuses on the mobile visual system after the v7.0–v7.2 hardening work.

- `assets/mobile-home-starry-bg.svg` now carries a denser fine-star field plus layered center glows so the mobile home hero has more depth without re-enabling animated particles.
- `css/style.css` tightens the mobile overview bottom dock into a lighter single-layer glass control and keeps the mobile home cache key aligned with the release.
- `css/blog-page.css` scales down the mobile overview search bar, category chips, card body details, and bookmark controls for a more balanced mobile rhythm.
- Mobile smoke and visual regression contracts now lock the compact bookmark/control sizing.
- Static CSS/JS/SVG entry URLs use the `20260516-v73` cache key so deployed browsers fetch the refreshed build promptly.

## 2.1 Version v7.2 Highlights

v7.2 closes three small but real defense / clarity gaps left after v7.0–v7.1.

- `scripts/build-mobile-fallbacks.mjs` now skips keyframe step selectors so future `@keyframes` blocks inside touch media queries cannot produce invalid `html.is-mobile-device-viewport 0% { ... }` CSS.
- `api/image.js` sniffs the first bytes of every proxied response body for `<?xml` / `<svg` / `<!DOCTYPE svg` signatures and rejects with 415 even when the upstream `Content-Type` claims a raster MIME — defense in depth on top of the existing MIME allow-list.
- `js/bookmark.js` renames `BOOKMARK_METADATA_VERSION` to `BOOKMARK_METADATA_HYDRATION_GENERATION` and documents that the constant is a "force refresh on read" trigger, not a real schema version (there is no migration logic). The stored `metadataVersion` field is left untouched for backward compatibility with existing entries in users' localStorage.
- Static CSS/JS/SVG entry URLs use the `20260516-v72` cache key so deployed browsers fetch the refreshed build promptly.

## 2.2 Version v7.1 Highlights

v7.1 reduces SSR article-template work by parsing `post.html` once per render path and applying accumulated DOM patches in one pass.

- `api/post.js` now creates a shared template editor around one parse5 document and patch list.
- SSR success rendering queues head metadata, skeleton visibility, article content, initial JSON, and JSON-LD insertion before a single `editor.apply()`.
- The string-input helper wrappers stay testable for smoke checks, while the live success path uses the editor directly.
- Static CSS/JS/SVG entry URLs use the `20260516-v71` cache key so deployed browsers fetch the refreshed build promptly.

## 2.3 Version v7.0 Highlights

v7.0 removes the hand-maintained mobile fallback CSS debt by deriving compatibility rules from the real touch media queries.

- `scripts/build-mobile-fallbacks.mjs` uses PostCSS plus `postcss-selector-parser` to generate `html.is-mobile-device-viewport` fallback rules from the gated mobile media queries.
- `npm.cmd run check` now runs `build-mobile-fallbacks --check` before metadata and smoke checks, so generated CSS drift fails fast.
- The generated fallback keeps base `768px`, `540px`, and `360px` cascades explicit instead of flattening narrow overrides into broad fallback rules.
- Static CSS/JS/SVG entry URLs use the `20260516-v70` cache key so deployed browsers fetch the refreshed build promptly.

## 2.1 Version v6.9 Highlights

v6.9 closes the final audit-polish items around inert script data blocks, selector escaping, and local API parity.

- SSR article JSON-LD and initial JSON payload scripts no longer receive CSP nonces because those script types are HTML data blocks, not executable scripts.
- `runtime-core.js` syncs structured data without propagating nonce attributes.
- `js/bookmark.js` has a complete `CSS.escape` fallback for older browser engines, and `scripts/local-server.mjs` now forwards parsed request bodies to API handlers.
- Static CSS/JS/SVG entry URLs use the `20260516-v69` cache key so deployed browsers fetch the refreshed build promptly.

## 2.1 Version v6.8 Highlights

v6.8 expands shared category color sanitization to carefully support modern CSS Color Level 4 values.

- `js/notion-content-utils.js` accepts `rgb(0 0 0 / 50%)`, `oklch(...)`, and safe `color-mix(...)` values through a function-name allowlist.
- The sanitizer still rejects `url(...)`, `var(...)`, comments, quotes, angle brackets, semicolons, and unbalanced parentheses before values reach inline styles.
- Client cards, SSR article shells, and server category presentation all share the same color sanitizer.
- Static CSS/JS/SVG entry URLs use the `20260516-v68` cache key so deployed browsers fetch the refreshed build promptly.

## 2.1 Version v6.7 Highlights

v6.7 moves SSR article template mutation from regex replacements to parse5-backed DOM source ranges.

- `api/post.js` parses `post.html` before mutating head metadata, article content, fallback empty state, and inline JSON payloads.
- SSR replacements now target node IDs, comments, attributes, and end-tag ranges instead of matching template text with regular expressions.
- The smoke harness injects parse5 into CommonJS module tests so the same helper paths run under the VM-based checks.
- Static CSS/JS/SVG entry URLs use the `20260516-v67` cache key so deployed browsers fetch the refreshed build promptly.

## 2.1 Version v6.6 Highlights

v6.6 migrates static metadata injection to a parse5-backed DOM workflow while keeping committed HTML formatting stable.

- `scripts/inject-site-meta.mjs` now locates HTML nodes through parse5 instead of regex templates.
- The rewriter updates only metadata, manifest, CTA, and modulepreload ranges to avoid broad page rewrites.
- Manifest generation remains part of the same check path so standalone metadata stays synchronized.
- Static CSS/JS/SVG entry URLs use the `20260516-v66` cache key so deployed browsers fetch the refreshed build promptly.

## 2.1 Version v6.5 Highlights

v6.5 makes SSR CSP delivery single-source: response headers carry nonce-bearing policy, while static meta stays as a fallback-only policy.

- Article SSR no longer rewrites the template CSP meta tag per request.
- Nonce-aware CSP is emitted through the HTTP response header for SSR paths.
- Security policy comments document the static-meta and `frame-ancestors` split.
- Static CSS/JS/SVG entry URLs use the `20260516-v65` cache key so deployed browsers fetch the refreshed build promptly.

## 2.1 Version v6.4 Highlights

v6.4 turns visual regression into a golden-image workflow so mobile and desktop rendering changes are caught at the screenshot level.

- Visual checks now compare captured PNGs against committed baselines with a small pixel-diff threshold.
- `npm.cmd run visual:approve` refreshes baselines only when an intentional design change needs approval.
- Mobile halo coverage moved from brittle CSS byte checks to full-page screenshot comparison.
- Static CSS/JS/SVG entry URLs use the `20260516-v64` cache key so deployed browsers fetch the refreshed build promptly.

## 2.1 Version v6.3 Highlights

v6.3 consolidates HTML attribute escaping for server-side rendering and release tooling while making browser module dependency failures easier to diagnose.

- SSR post metadata and static metadata injection now use shared HTML attribute escaping helpers.
- `notion-content.js` reports the exact missing dependency when the browser load order is wrong.
- Smoke checks cover the new helper modules so escape behavior stays syntax-checked.
- Static CSS/JS/SVG entry URLs use the `20260516-v63` cache key so deployed browsers fetch the refreshed build promptly.

## 2.1 Version v6.2 Highlights

v6.2 aligns category gradient sanitization across server and browser rendering and refreshes release documentation guardrails.

- Server category gradients now accept `calc()` expressions containing `+`, matching the browser sanitizer.
- `FIX_TODO.md`, README, and architecture docs now describe the current release and check pipeline.
- Smoke checks now assert that release metadata stays synchronized across package, TODO, and architecture files.
- Static CSS/JS/SVG entry URLs use the `20260516-v62` cache key so deployed browsers fetch the synchronized build promptly.

## 2.1 Version v6.1 Highlights

v6.1 refines the mobile home halo shape after the v6.0 release: the center glow now reads as a broad horizontal blue spread around the title/search controls instead of a vertical beam.

- The mobile home `.hero-section::after` glow is now a 920px by 500px `ellipse at center` with subtle stops `0.08` -> `0.045` -> `0.014` -> `transparent 100%`, applied in both the real mobile media query and the `html.is-mobile-device-viewport` fallback block.
- `assets/mobile-home-starry-bg.svg` now defines `centerGlow` in user-space coordinates with a horizontal `gradientTransform`, avoiding the percentage radial stretch that made the middle glow look too tall on 390px-wide phones.
- `scripts/smoke-check/mobile-layout.mjs` names and enforces the horizontal-ellipse contract so later edits do not reintroduce the cropped vertical-circle look.
- Static CSS/JS/SVG entry URLs use the `20260515-halo-v61` cache key so deployed browsers and CDNs fetch the corrected v6.1 halo promptly.

## 2.1 Version v6.0 Highlights

v6.0 finishes the mobile home visual pass by removing the visible blue spotlight disc, adds standalone mobile launch metadata for the no-address-bar composition, and hardens the release checks that caught the Node 22 failure.

- The mobile home `.hero-section::after` glow now renders as a subtle offscreen falloff: 900px -> 1100px square, top 54% -> 57%, and opacity stops reduced to `0.08` -> `0.04` -> `0.018` -> `transparent 100%`. The same values are applied in both the real mobile media query and the `html.is-mobile-device-viewport` fallback block.
- `assets/mobile-home-starry-bg.svg` dims and lowers the center glow (`cy=59%`, `r=64%`, opacities `.34/.16`) and slightly reduces the lower violet wash, matching the reference without the top-left wash or the v5.10 circular spotlight.
- Static pages now link `/manifest.webmanifest` and include mobile/iOS standalone meta tags. The manifest requests `display: standalone`, uses the approved 256px PNG icon, and is served locally as `application/manifest+json`; Vercel revalidates it with `public, max-age=0, must-revalidate`.
- `scripts/visual-regression.mjs` always uses the repo's deterministic CDP WebSocket client so strict visual checks behave the same on the GitHub Actions Node 22/24 matrix.
- Runtime polish fixes from the review are included: active-page nonce preservation for JSON-LD sync, validated session-cache timestamps, literal-safe metadata replacement callbacks, and `.claude/` ignored as local tooling state.
- Static CSS/JS/SVG entry URLs use the `20260515-v60` cache key so deployed browsers and CDNs fetch the v6.0 visual assets promptly.

## 2.2 Version v5.10 Highlights

v5.10 dissolves the visible disc edge in the mobile home hero glow and adds a smoke-check parity contract that prevents mobile CSS fallback drift.

- The mobile home `.hero-section::after` spotlight is widened past every supported phone viewport so the disc boundary falls offscreen: 480px → 900px square, opacity stops reorganized into a 4-stop smooth falloff (`rgba(73, 145, 255, 0.2)` → `0.11` → `0.05` → `transparent 100%`), removing the hard transparent-at-70% edge that v5.9 left visible. Applied identically in the `@media` block AND the `html.is-mobile-device-viewport` fallback block.
- `scripts/smoke-check/mobile-layout.mjs` now requires (a) byte-exact `background` equality between the two mobile blocks and (b) the gradient must contain `transparent 100%` (the prior `transparent 70%` is rejected). Regressing the disc edge or splitting the two blocks again will fail CI.
- Static CSS/JS/SVG entry URLs use the `20260515-v510` cache key so browsers and CDNs fetch the wider glow without serving v5.9's narrow disc through the `stale-while-revalidate` window.

## 2.3 Version v5.9 Highlights

v5.9 completed the mobile home visual restoration and landed the full post-v5.7 cross-review backlog — 39 phased fixes plus 4 audit-stage corrections — in a single release.

- The mobile home centered glow now matches the intended bright cyan-blue spotlight in both rendering paths: `assets/mobile-home-starry-bg.svg` `centerGlow` opacities `0.32/0.20` → `0.55/0.32` with the inner stop recolored toward `#3e7bcf`, radius 54% → 60%, focal point cy 59% → 56%; CSS `.hero-section::after` size 360px → 480px, opacities `0.10/0.045` → `0.24/0.11`, top 56% → 54%, fixed in both the `@media` block and the `html.is-mobile-device-viewport` fallback block.
- Static CSS/JS/SVG entry URLs now use the `20260515-v59` cache key so browsers and CDNs fetch the synchronized glow without stale mobile halo assets.
- Dead browser-API code paths removed: `navigator.mozConnection` / `webkitConnection` (deprecated prefixes), `nav.msMaxTouchPoints` (IE/old-Edge only), `shouldDisableMobileParticles` wrapper, `particleProfile.disabled` (always equal to `isMobile`), the `window.initBlogCardReveal` legacy alias, and the `ParticleCtor` synonym.
- Module API surface tightened: `js/site-utils.js` `resolveDisplayImageUrl` and `js/notion-content-url.js` `resolveProxiedDisplayImageUrl` collapse from wrapper functions to `const` aliases; `js/blog-page.js` `resolveSafeCoverImage` triple-ternary rewritten to 2-tier; `js/ui-effects.js` exposes `window.UIEffects.initBlogCardReveal` instead of a naked global.
- SSR template contract hardened: `post.html` carries explicit `<!--SSR_HEAD_META_START-->`/`<!--SSR_HEAD_META_END-->` markers (already in v5.7) plus a new `data-empty-link` anchor; `api/post.js` empty-state replacement is now attribute-order tolerant; `scripts/smoke-check.mjs` asserts the postContent placeholder, postEmpty container, and data-empty-link anchor must exist.
- LaTeX block coverage extended to `\mathbb`, `\mathcal`, `\mathfrak`, `\mathbf`, `\mathsf`, `\mathtt`, `\overline`, `\underline`, `\boxed`.
- Service-layer consistency fixed: `server/category-navigation.js` `normalizeCategoryGradient` accepts `radial-gradient` (matching the client side) and rejects `;`/`url()`; `server/post-service.js` paginates before decorating; `server/category-navigation.js` `buildPublicCategories` splits sort and presentation phases instead of building the presentation twice; `server/notion-config.js` `createAsyncLimiter` documents that queue depth is bounded by the upstream block-budget.
- `scripts/lib/dotenv.mjs` shared `.env` parser replaces the duplicated implementations in `scripts/local-server.mjs` and `scripts/notion-live-check.mjs`.
- `js/spa-router.js` `pageCache` adds `MAX_PAGE_CACHE_BYTES=2MB` total + `MAX_PER_ENTRY_CACHE_BYTES=1MB` per-entry size caps with `dropCacheEntry` / `evictOldestCacheEntry` accounting helpers; stylesheet loading is now `Promise.all` parallel.
- CSS `html.is-mobile-device-viewport` block carries an explicit comment documenting the parity contract with the `@media` block; `scripts/smoke-check/mobile-layout.mjs` enforces `.hero-section::after` parity (width/height/top/background) between the two blocks and locks the v5.9 brightened opacity.
- [FIX_TODO.md](FIX_TODO.md) rewritten to reflect that all 39+4 items are landed, with 4 architectural items (CSS double-write integration, SSR template jsdom migration, CSS Color L4 support, i18n-safe nav active key) carried forward as "需评估再启动" backlog.
- `PageLoaders` load the shared blog/post rendering chain sequentially before page modules, avoiding the race introduced by the v5.5 parallel dynamic imports.
- Public client payloads no longer expose or regenerate `_searchText`; server-side search text stays non-enumerable and internal.
- Server-side Notion block rendering now has a configurable total block budget, bounded recursive fan-out, and single-flight failure cooldowns.
- Browser-side post summary caching and `sessionStorage` cleanup are bounded and throttled to reduce repeated tab-sync work.
- Release verification runs the smoke suite and strict visual regression in parallel, and GitHub Actions now covers Node 22 and 24 with stale workflow cancellation.
- `FIX_TODO.md` is the single authoritative repair status document; summary documents point back to it instead of carrying duplicate stale checklists.
- Mobile pages now disable the particle canvas entirely after real-device frame-rate checks, while desktop home keeps the 350-particle animation.
- Blog cover placeholders no longer render the notebook emoji; slow or failed covers fall back to quiet gradients.
- Browser icons keep using the restored `favicon.png` brand artwork directly, while share previews use a lightweight `og-image.jpg` derivative so SEO metadata no longer ships the 1.36 MB source image.
- Mobile home title styling uses the same animated `title-gradient` colors as desktop, with mobile-only sizing and vertical placement.
- Mobile blog card bookmark buttons are kept at the smaller 26px visual size so the card action does not dominate the title row.
- `scripts/smoke-check.mjs` now enforces a single static CSS/JS `?v=` value across HTML entrypoints.
- Production-domain fallback references to `0000068.xyz` are centralized around `site.config.json`; `server/notion-server.js`, `/api/sitemap`, and `/api/robots` read the configured origin instead of duplicating the domain literal.
- `server/notion-client.js`, `server/notion-schema.js`, `server/public-policy.js`, `server/post-service.js`, `server/block-service.js`, `server/cache-store.js`, and `server/render-service.js` split Notion requests, schema inference, public policy, post queries, block recursion, caches, and SSR helpers out of `server/notion-server.js`.
- `server/notion-config.js` and `server/category-navigation.js` keep stable configuration and category presentation helpers outside the compatibility export layer.
- `js/app.js` is the single `type="module"` frontend entry, replacing the long HTML script chain while preserving the vanilla JS runtime.
- `js/notion-content-utils.js` split pure schema, property lookup, escaping, and search-text helpers out of `js/notion-content.js`; HTML entrypoints load it before the renderer.
- `js/notion-content-shared.js`, `js/notion-content-url.js`, and `js/notion-article-renderer.js` further isolate category constants, URL/image policy, and article shell markup from the central Notion renderer.
- `/robots.txt` is served dynamically through `/api/robots` in both Vercel and the local development server.
- Local repository residue is cleaned up: the ignored `node_modules/` folder is removed, `.local-server.pid` is ignored, and no root log files are left behind.
- Static checks cover the mobile hero gradient, mobile particle removal, small card bookmark action, cache-busting asset version, dynamic robots output, and controlled production-domain hardcoding.

### v3.8 Highlights

v3.8 packages the earlier mobile compatibility and maintenance work into a release commit while preserving the desktop UI and particle behavior.

- `package.json` and README release metadata matched the `v3.8` release tag convention.
- `scripts/smoke-check.mjs` enforced a single static CSS/JS `?v=` value across HTML entrypoints.
- Production-domain fallback references to `0000068.xyz` were constrained by a smoke-check whitelist so hardcoded SEO URLs would not spread accidentally.
- Local repository residue was cleaned up: the ignored `node_modules/` folder was removed, `.local-server.pid` was ignored, and no root log files were left behind.
- Browser verification covered `390x844` mobile home/list/article states and `1280x720` desktop home particles without changing PC UI or desktop particle logic.

### v3.5 Highlights

v3.5 closes the remaining mobile Brave/vivo UI compatibility gap after the v3.4 article-width fix.

- Static CSS/JS references now carry `?v=20260512-mobile-compat` so mobile Brave/vivo cannot keep rendering an older cached stylesheet after an HTML refresh.
- `js/site-utils.js` syncs `html.is-mobile-device-viewport` from touch capability plus narrow viewport width, giving Android browsers a fallback when `(hover: none) and (pointer: coarse)` is misreported.
- The mobile home title keeps the product phrase on one line with phone-specific sizing, matching the current mobile hero art direction without touching the desktop hero.
- `blog.html` uses `type="search"` for the list search input so mobile browsers expose the expected search keyboard and clear affordance.
- `scripts/smoke-check.mjs` asserts cache-busted assets, the mobile compatibility class, the search input type, and the mobile article/list fallback rules.

### v3.4 Highlights

v3.4 is a mobile article compatibility hotfix for long URLs and browser-specific layout width handling.

- `css/post-page.css` now forces article content, paragraphs, links, and list items to break long URL-like strings before they widen the layout.
- Mobile article wrappers are clamped to `100%` width with `min-width: 0` to avoid Brave/vivo-style horizontal overflow and right-side background seams.
- `scripts/smoke-check.mjs` now asserts the long-word wrapping and mobile article wrapper clamp rules.

### v3.3 Highlights

v3.3 focuses the mobile experience on stable reading and lighter rendering while preserving the desktop particle UI.

- `js/common.js` keeps the old desktop particle class, 350-particle density, and desktop frame cadence unchanged.
- Real mobile home pages now use a separate `MobileParticle` model and draw 28 particles once as a static frame to reduce phone CPU/GPU cost.
- Real mobile blog and article pages disable the particle canvas entirely and use a unified static background layer to avoid zoom/address-bar background breaks.
- Mobile UI and performance overrides still require `(max-width: 768px) and (hover: none) and (pointer: coarse)`, so a narrow desktop browser window keeps desktop particles and desktop layout behavior.
- Real mobile article pages hide the bottom dock and article bookmark entry so reading content is not covered by floating controls.
- Real mobile blog cover placeholders suppress the notebook emoji fallback so slow or failed covers do not flash a jarring icon.

### v3.2 Highlights

v3.2 fixes Notion formula rendering and adds a mobile-only particle performance profile while preserving desktop animation behavior.

- `js/notion-content.js` renders Notion block and inline equations as local MathML, keeping the original TeX only in hidden `application/x-tex` annotations for accessibility and copy/debug use.
- `css/post-page.css` styles rendered math directly, removing the previous visible `<code>` treatment that made formulas look like raw LaTeX source.
- `js/common.js` keeps the old desktop particle class, 350-particle density, and frame cadence unchanged.
- Real mobile devices use a separate `MobileParticle` model to reduce phone CPU/GPU cost.
- Mobile UI and performance overrides require `(max-width: 768px) and (hover: none) and (pointer: coarse)`, so a narrow desktop browser window keeps desktop particles and desktop layout behavior.

### v3.1 Highlights

v3.1 restores the preferred old animation feel while keeping mobile-only performance and layout rules isolated from desktop behavior.

- Mobile UI and performance overrides require `(max-width: 768px) and (hover: none) and (pointer: coarse)`, so a narrow desktop browser window keeps desktop particles and desktop layout behavior.
- Article pages move the bookmark control into the mobile dock only on real mobile devices; desktop keeps the floating bookmark control.
- The article mobile dock accounts for horizontal safe areas, keeps the four-action layout visible at normal phone widths, and switches to icon-only labels below 360px to avoid clipping.
- Route transitions intentionally keep the old quick fade/slide cadence instead of using a reduced-motion variant.

### v2.8 Highlights

v2.8 is a code-quality and maintainability release that closes out the review backlog tracked in v2.7 while keeping the public runtime behavior unchanged.

- Shared `notion-content.js` block rendering now goes through a `createBlockRenderers()` registry instead of a central switch, so new block types can be added without editing a shared control flow.
- Browser-side `notion-api.js` post-summary memory cache is now a bounded LRU of up to 200 entries through `rememberPostSummaryInMemory()`, keeping long-lived SPA sessions from accumulating unbounded summary state.
- `api/image.js` timeout, size limit, and redirect hop count now accept `IMAGE_PROXY_TIMEOUT_MS`, `IMAGE_PROXY_MAX_BYTES`, and `IMAGE_PROXY_MAX_REDIRECTS` env overrides while preserving the existing defaults.
- `api/post.js` head metadata, CSP meta, and post content replacements now all use a `didMatch` closure flag so template-replacement detection no longer depends on string equality and is safe even when the replacement value matches the original.
- `server/notion-server.js` `buildPublicAccessPolicyFromDatabase()` drops its unused `database` parameter; database-wide public mode stays the single long-term policy.
- `scripts/smoke-check.mjs` is split into a thin entrypoint plus focused modules under `scripts/smoke-check/` (`harness`, `blog-page`, `image-proxy`, `notion-api-client`, `public-content-notion`, `routing-vercel`).
- `scripts/local-server.mjs` gains full MIME coverage for `.webp`, `.jpg`, `.jpeg`, `.ico`, `.xml`, and `.mjs` so local dev matches production content types more closely.
- `css/post-page.css` drops the `body[data-page="post"] .fab-bookmark { display: none !important; }` override; JavaScript is now the single source of truth for floating bookmark visibility, and `js/post-page.js` continues to hide the fab on mobile in favor of the top-bar bookmark action.
- `js/common.js` particle runtime keeps the original always-on starfield motion and avoids reduced-motion gates that would freeze the canvas after the first frame.
- `js/site-utils.js` centralizes the real-mobile query `(max-width: 768px) and (hover: none) and (pointer: coarse)` so mobile UI and performance changes do not affect narrow desktop windows.
- `js/post-page.js` demotes the "NotionAPI is unavailable" fallback log from `console.error` to `console.warn`, reflecting that it is a supported SSR fallback path rather than an error.
- `vercel.json` intent around `/api/*` cache headers is documented directly in §5: do not add a catch-all `Cache-Control` there, since each handler owns its own policy (e.g. `/api/image` edge caching).
- Kiro steering file `.kiro/steering/git-rules.md` mirrors the release commit convention from §13 as always-on workspace steering.
- Removed the stray empty `new/` directory from the repository root.

### v2.7 Highlights

v2.7 restores and locks the v2.5-compatible database-wide public content behavior, and fixes the two review findings around SVG image proxying and unbounded public list filters.

- The configured Notion database is always treated as public content. This is the intended long-term behavior for this project; public/published/status fields are ignored by the runtime and should only be used for Notion-side organization.
- Legacy public visibility environment variables and field-based filtering paths remain removed from the server, and smoke tests assert that the runtime keeps the database-wide public policy.
- `/api/image` now rejects `image/svg+xml` responses, including SVG content types with parameters, so active SVG cannot be served back from this site's origin.
- Public list `category` and `search` query inputs are capped before cache-key generation and local filtering to avoid wasteful memory/CPU use from very large query strings.

### v2.6 Highlights

v2.6 is a production-hardening release focused on deep SSRF defense, CSS design-token centralization, preserving v2.5-compatible database-wide public content, sitemap enrichment, and developer-experience improvements.

- `/api/image` SSRF defense rewritten from simple regex patterns to a multi-layer pipeline: hostname blocklist (including cloud metadata endpoints), full IPv4 and IPv6 private-range parsing, DNS resolution with private-IP rejection, validated-IP pinning via custom `lookup` so the actual HTTPS request uses the already-verified address, manual redirect-hop validation (up to 4 hops), and per-hop DNS re-verification.
- Server-side public access policy intentionally stays compatible with v2.5: the whole configured Notion database is treated as public content. This project should keep that database-wide public behavior; public/published fields are considered Notion-side organization only, not runtime filters.
- CSS design tokens centralized in `style.css`: `--accent-cyan-bg`, `--accent-cyan-border`, `--accent-cyan-glow`, `--accent-bookmark`, `--accent-bookmark-bg`, and related derived tokens replace ~30 hardcoded `rgba()` values across `blog-page.css` and `post-page.css`.
- Sitemap entries now include `<changefreq>` and `<priority>` tags for better search engine guidance.
- `vercel.json` adds explicit `Cache-Control: public, max-age=0, must-revalidate` for `/` and `X-Content-Type-Options: nosniff` for all `/api/*` routes.
- SSR template is re-read on every request in development mode (`NODE_ENV=development`), enabling hot-reload of `post.html` without restarting the local server.
- Local dev server sets `NODE_ENV=development` automatically and hardens its static file path traversal check with `path.resolve` + `path.relative`.
- `bookmark.js` and `common.js` wrapped in IIFE closures to prevent global scope pollution.
- `notion-api.js` restructured with IIFE closure and consistent internal organization.
- `blog-page.js` inline fallback functions annotated with `@canonical-source` comments for traceability to their canonical implementations.
- `spa-router.js` adds clarifying comments for same-page hash-only navigation passthrough.
- Smoke tests expanded with new assertions for image proxy SSRF pipeline, DNS pinning, redirect-hop validation, and updated environment variable behavior.
- `package.json` adds `"type": "commonjs"` and `"license": "MIT"` fields; `.env.example` and `LICENSE` file added to the repository.

### v2.5 Highlights

v2.5 is a code-quality refactoring release focused on DRY compliance, defensive programming, and constant centralization.

- Shared design constants `DEFAULT_COVER_GRADIENT` and `DEFAULT_CATEGORY_COLOR` are now exported from `notion-content.js` as the single source of truth.
- `notion-api.js` and `blog-page.js` reference the canonical constants from `NotionContent` instead of maintaining independent copies.
- `escapeHtml` in `notion-api.js` now includes a proper inline fallback instead of potentially exporting `undefined`.
- `sanitizeCssColor` in `blog-page.js` now validates CSS color values against a strict whitelist instead of returning the input unchanged.
- Duplicated bookmark hash URL builder functions (~50 lines) in `blog-page.js` replaced with compact inline fallbacks.
- `restoreCoverPlaceholder` now uses `DEFAULT_COVER_GRADIENT` consistently with `renderCard`, preventing color flashes when cover images fail to load.
- `gradientForCategory` in `notion-content.js` uses the exported constant instead of a hardcoded string.

### v2.4 Highlights

v2.4 refined the SPA route transition internals, fixes card cover placeholders, and adds a project README; the current motion parameters keep the earlier quick v1.6 feel.

- SPA route exit uses the original quick `0.15s ease` timing with `translateY(-8px)` for a crisp page switch.
- SPA route entry uses the original `0.25s` timing with `translateY(12px)` for a light slide into view.
- Route exit visual cue pause stays at 150ms for a quick page-switching feel.
- Initial page load CSS animation returns to the original 0.5s, 15px fade/slide without scale.
- Transition reset timer returns to 300ms to match the shorter entry animation.
- Blog card cover placeholders now use the site-consistent dark gradient instead of Notion-sourced gradients when an image is present, preventing jarring color flashes before images load.
- Added comprehensive project README with features, architecture, quick-start guide, deployment instructions, and environment variable reference.

### v2.3 Highlights

v2.3 restores the v1.6-style whole-page SPA route motion while keeping the v2.0 navigation, cover image, mobile performance, and local development improvements.

- Blog top actions now switch listing state in-page, avoiding a full reload when moving between bookmarks and overview.
- Blog cards preload the first visible cover images and mark first-screen covers as `loading="eager"` with `fetchpriority="high"`; real mobile devices reduce this to the first cover only.
- Blog cover cards include a stable fallback layer so slow images do not leave a blank cover area.
- Blog cover media is non-interactive so clicks always reach the card link, while bookmark buttons remain above the link layer.
- Article content prioritizes the first image with eager loading and high fetch priority.
- Remote display images can be routed through the same-origin `/api/image` proxy for better cache behavior.
- Mobile particle rendering uses a lightweight profile on real mobile devices only, and particles pause briefly while scrolling on mobile pages where they are enabled.
- Mobile UI and performance overrides are gated by the shared real-mobile media query rather than width alone, keeping PC behavior stable even in narrow browser windows.
- SPA page HTML requests are coalesced, while route swaps keep the v1.6-style 150ms visual exit cue.
- SPA article navigation uses `/post.html?id=...` first on local dev origins and falls back to it when another server does not support `/posts/:id` rewrites.
- SPA route transitions use the v1.6-style whole-page fade/slide cadence: quick fade out, short visual cue, and a 12px page slide in.
- Nested first-load animations are suppressed during SPA swaps so page titles, top actions, and content do not compete with the whole-page transition.
- Route transitions include a stuck-state fallback, with a faster local post fallback, so the page cannot remain transparent or non-clickable if navigation stalls.
- Route transitions intentionally keep the original animated fade/slide cadence instead of switching to a reduced-motion variant.
- `npm.cmd run dev` now starts a local API-aware server through `scripts/local-server.mjs`.

## 3. Public Routes

| Route | Handler | Notes |
|---|---|---|
| `/` | `index.html` | Home/search entry |
| `/blog.html` | `blog.html` | Blog list and local bookmark list |
| `/blog.html#bookmarks` | `blog-page.js` | Local bookmark view, marked noindex at runtime |
| `/posts/:id` | `/api/post?id=:id` | Canonical SSR article route |
| `/post.html?id=:id` | `/api/post` | Template-compatible article entry |
| `/robots.txt` | `/api/robots` | Dynamic robots.txt |
| `/sitemap.xml` | `/api/sitemap` | Dynamic sitemap |

## 4. API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/posts-data` | `GET` | Public post list JSON |
| `/api/post-data` | `GET` | Single post JSON |
| `/api/post` | `GET` | SSR article HTML |
| `/api/image` | `GET` | Same-origin remote image proxy |
| `/api/robots` | `GET` | Dynamic robots.txt |
| `/api/sitemap` | `GET` | Dynamic sitemap XML |
| `/api/notion` | Any | Disabled legacy proxy, fixed `410` |

Read-only public APIs reject non-`GET` methods with `405` and `Cache-Control: no-store`.

## 5. Caching

| Resource | Cache-Control |
|---|---|
| Static HTML and `/` | `public, max-age=0, must-revalidate` |
| CSS and JS | `public, max-age=3600, stale-while-revalidate=86400` |
| `favicon.png`, `og-image.jpg` | `public, max-age=86400` |
| Successful `/api/image` responses | `public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400` |
| `/api/posts-data` list JSON | `public, max-age=0, s-maxage=60, stale-while-revalidate=300` |
| `/api/sitemap` | `public, max-age=0, s-maxage=300, stale-while-revalidate=600` |
| `/api/robots` | `public, max-age=0, s-maxage=3600, stale-while-revalidate=86400` |
| `/api/post-data` and SSR post HTML | `no-store` |
| Public API errors | `no-store` |
| Disabled `/api/notion` | `no-store` |

`vercel.json` does not set an API-wide `Cache-Control`; individual handlers own their cache policy so `/api/image` can stay edge-cacheable while data and SSR routes stay non-cacheable. Do not add a catch-all `/api/*` `Cache-Control` header in `vercel.json`.

The global `/(.*)` headers block in `vercel.json` (CSP frame-ancestors, X-Frame-Options, HSTS, Referrer-Policy, Permissions-Policy) applies to API routes as well — Vercel header rules are additive across matching `source` patterns, so the `/api/(.*)` `X-Content-Type-Options: nosniff` rule layers on top of the catch-all rather than replacing it. Do not move these headers under `/api/(.*)`; HTML/static responses also need them.

Static HTML must keep adding a cache-busting query string to changed CSS/JS paths when a mobile layout fix ships, because some Android browsers continue to use stale assets during the `stale-while-revalidate` window.

Client-side `notion-api.js` keeps a short bounded in-memory post-list response cache for fast repeated listing transitions. It also keeps up to 200 post summaries in memory plus `sessionStorage` for bookmark hydration.

## 6. Security

- Global Vercel headers keep frame protection through `frame-ancestors 'none'` and `X-Frame-Options: DENY`, and also emit HSTS, Referrer-Policy, and Permissions-Policy.
- Static pages use CSP meta tags generated from `server/security-policy.js`.
- SSR article pages send CSP through response headers; JSON-LD and initial post data remain inert script data blocks without nonce attributes.
- `connect-src` remains same-origin so browser data requests continue through semantic API routes.
- `/api/image` only accepts `https:` upstream URLs, rejects localhost/private literal hosts and private DNS results, pins the validated DNS answer to the actual HTTPS request through a custom lookup, validates every redirect hop manually, enforces image content types, limits image size, applies a timeout, and sends `X-Content-Type-Options: nosniff`.
- Embed iframes intentionally use a permissive sandbox subset (`allow-scripts`, `allow-same-origin`, popups, forms, and presentation) so trusted providers such as YouTube, Bilibili, Vimeo, Figma, Loom, and CodePen can render; this is a deliberate usability tradeoff, while page-level `frame-src`, same-origin API boundaries, and `frame-ancestors 'none'` still constrain where embeds can load and how this site can be framed.
- Public error details are hidden unless `EXPOSE_PUBLIC_ERROR_DETAILS=true` is set for local debugging.

## 7. Repository Structure

```text
.
|-- index.html
|-- blog.html
|-- post.html
|-- package.json
|-- vercel.json
|-- site.config.json
|-- favicon.png
|-- og-image.jpg
|-- SITE_ARCHITECTURE.md
|-- api/
|   |-- image.js
|   |-- posts-data.js
|   |-- post-data.js
|   |-- post.js
|   |-- robots.js
|   |-- sitemap.js
|   `-- notion.js
|-- server/
|   |-- notion-server.js
|   |-- notion-client.js
|   |-- notion-schema.js
|   |-- public-policy.js
|   |-- post-service.js
|   |-- block-service.js
|   |-- cache-store.js
|   |-- render-service.js
|   |-- notion-config.js
|   |-- category-navigation.js
|   |-- public-content.js
|   `-- security-policy.js
|-- js/
|   |-- app.js
|   |-- notion-content-shared.js
|   |-- notion-content-utils.js
|   |-- notion-content-url.js
|   |-- notion-article-renderer.js
|   |-- notion-content.js
|   |-- runtime-core.js
|   |-- site-utils.js
|   |-- common.js
|   |-- ui-effects.js
|   |-- seo-meta.js
|   |-- spa-router.js
|   |-- notion-api.js
|   |-- bookmark.js
|   |-- index-page.js
|   |-- blog-page.js
|   |-- post-page.js
|   `-- font-loader.js
|-- css/
|   |-- style.css
|   |-- blog-page.css
|   `-- post-page.css
`-- scripts/
    |-- local-server.mjs
    |-- smoke-check.mjs
    |-- smoke-check/
    |   |-- blog-page.mjs
    |   |-- harness.mjs
    |   |-- image-proxy.mjs
    |   |-- notion-api-client.mjs
    |   |-- public-content-notion.mjs
    |   `-- routing-vercel.mjs
    `-- fixtures/
        `-- notion-block-fixtures.mjs
```

## 8. Frontend Runtime

All three HTML entry pages load shared runtime scripts marked with `data-spa-runtime`:

- `font-loader.js`
- `notion-content-shared.js`
- `notion-content-utils.js`
- `notion-content-url.js`
- `notion-article-renderer.js`
- `notion-content.js`
- `runtime-core.js`
- `site-utils.js`
- `common.js`
- `ui-effects.js`
- `seo-meta.js`
- `spa-router.js`

Page-specific scripts are then loaded as needed:

| File | Responsibility |
|---|---|
| `index-page.js` | Home search and navigation |
| `blog-page.js` | Listing state, search, filters, pagination, bookmarks, cover preloading |
| `post-page.js` | Article hydration, SEO sync, bookmark state, SSR fallback behavior |
| `bookmark.js` | Local bookmark persistence and legacy metadata hydration |
| `notion-api.js` | Browser-side API requests, summary cache, short list response cache |

### Frontend Module Entry

The HTML templates load one shared module script:

```html
<script type="module" src="/js/app.js?v=20260514-v46" data-spa-runtime></script>
```

`js/app.js` owns the frontend dependency order. The project still exposes browser runtime
helpers through `window.*` for compatibility, but templates no longer rely on a long list
of ordered classic scripts. The module graph is intentionally incremental; each side-effect
import carries the same `?v=` cache key as the HTML entry so nested ESM modules cannot reuse
an older browser or edge-cache copy after a release:

```
  font-loader.js
    (no dependencies — safe to load at any position)

  notion-content-shared.js
    ▸ window.NotionContentShared

  notion-content-utils.js
    ▸ window.NotionContentUtils

  notion-content-url.js
    ◂ window.NotionContentUtils
    ▸ window.NotionContentUrl

  notion-article-renderer.js
    ▸ window.NotionArticleRenderer

  notion-content.js
    ◂ window.NotionContentShared
    ◂ window.NotionContentUtils
    ◂ window.NotionContentUrl
    ◂ window.NotionArticleRenderer
    ▸ window.NotionContent

  runtime-core.js
    ▸ window.PageRuntime

  site-utils.js
    ◂ window.NotionContent  (resolveProxiedDisplayImageUrl)
    ▸ window.SiteUtils

  common.js
    ▸ window.ParticlesRuntime

  ui-effects.js
    (reads DOM only, no window.* dependencies)

  seo-meta.js
    ▸ window.updateSeoMeta

  spa-router.js
    ◂ window.PageRuntime     (page lifecycle hooks)
    ◂ window.SiteUtils       (URL helpers)
    ◂ window.updateSeoMeta   (meta tag sync on navigation)
    ◂ window.ParticlesRuntime (pointer target reset)
    ▸ window.SPARouter
```

Page modules (`notion-api.js`, `bookmark.js`, `index-page.js`, `blog-page.js`, and
`post-page.js`) are imported after the runtime set and may safely reference any of the
globals listed above.

`notion-content-utils.js` must load before `notion-content-url.js` and `notion-content.js`
because URL helpers and the renderer use the extracted origin, schema, property lookup,
escaping, and search-text helpers in both browser and CommonJS runtimes.

`spa-router.js` is imported after runtime helpers because it initializes link interception
immediately on load and depends on preceding globals.

`spa-router.js` keeps canonical URLs in the address bar, but can load `/post.html?id=...` as a compatibility fallback when a server returns `404` for `/posts/:id`. On local dev origins such as `127.0.0.1` and `localhost`, it loads that static post template first because the local static server does not rewrite `/posts/:id`. Route changes use the v1.6-style whole-page opacity/transform cadence with a short 150ms visual exit cue, then suppress nested first-load animations after the swap so the transition reads as one calm page movement. Same-path hash-only changes are intentionally passed through to native browser handling; `blog-page.js` owns the `hashchange` flow for `/blog.html#bookmarks`. If a route remains in its exit state too long, the router falls back to a local-compatible full navigation instead of leaving the page transparent or non-clickable.

`notion-content-shared.js` owns shared category constants, default category colors, cover gradients, and category fallback helpers.

`notion-content-utils.js` owns reusable pure content helpers such as schema resolution, page-property lookup, HTML escaping, CSS color sanitization, and post search-text normalization.

`notion-content-url.js` owns display-safe URL and image proxy helpers, including CSP-aligned image protocol checks, remote image proxy URL construction, embeddable URL normalization, and stable share-image selection.

`notion-article-renderer.js` owns the article header and shell HTML while receiving lower-level dependencies from `notion-content.js`.

`notion-content.js` renders Notion blocks through a `block.type` -> renderer registry built by `createBlockRenderers()`. New block types should be added as focused renderer entries so SSR and browser rendering stay aligned without expanding a central switch.

## 9. Image Loading Strategy

`notion-content.js` owns display-safe image URL handling:

- Same-origin images remain direct.
- External display images must be `https:`.
- Remote display images can be rewritten to `/api/image?src=...`.
- Share images still avoid likely ephemeral signed URLs and fall back to stable defaults.

`blog-page.js` uses `SiteUtils.resolveProxiedDisplayImageUrl()` for cover cards, preloads the first three cover images on desktop, preloads only the first cover on real mobile devices, and uses cover fallback markup so cards remain visually stable while images load.

Cover images and fallback layers set `pointer-events: none`; the full-card link sits above the media layer, and the bookmark button sits above the link. This preserves the expected behavior that clicking the cover opens the article and clicking the bookmark toggles the bookmark.

## 10. Server Content Layer

`server/notion-server.js` is now a compatibility export layer. Focused modules own the
actual behavior:

- `server/notion-client.js` owns Notion HTTP requests, request timeouts, token/database id lookup, site-origin fallback, and wrapped Notion error metadata.
- `server/notion-schema.js` owns Notion content property candidate overrides, schema resolution, list sorting, and category prefilters.
- `server/public-policy.js` owns the database-wide public access policy and page-public assertions.
- `server/post-service.js` owns public post listing, filtering, pagination, search, metadata loading, detail loading, and post payload construction.
- `server/block-service.js` owns recursive block fetching with pagination, child-fetch concurrency limits, and a per-post total block budget.
- `server/cache-store.js` owns reusable TTL slots, LRU TTL caches, single-flight loading with optional error cooldowns, and pending request maps.
- `server/render-service.js` owns SSR post HTML rendering, canonical post URLs, and article structured data preparation.

`server/notion-config.js` owns environment and site-origin normalization, checked-in
`site.config.json` loading, Notion path-id encoding, numeric env parsing, and the shared
async concurrency limiter.

`server/category-navigation.js` owns Notion-driven category presentation. It reads select
options from database metadata, merges category values found in post summaries, pins the
all-posts and featured categories, and applies display labels, emojis, colors, and cover
gradients from `site.config.json`.

Main server-side caches:

| Object | Location | TTL / Size |
|---|---|---|
| Database metadata | Memory | 5 minutes |
| Public post summaries | Memory | 2 minutes |
| Filtered results | Memory Map | Follows summary cache |
| Single post details | Memory LRU | 60 seconds / 20 entries |
| In-flight post requests | Promise Map | Request lifetime |
| Database/list single-flight failures | Memory | 2 seconds |

## 11. Local Development

Use:

```powershell
npm.cmd run dev
```

This starts `scripts/local-server.mjs` on `127.0.0.1:4173` by default and supports static assets plus semantic API routes including `/api/image`, `/api/post`, `/api/post-data`, `/api/posts-data`, `/api/robots`, and `/api/sitemap`.

Use:

```powershell
npm.cmd run check
```

For browser-level visual regression:

```powershell
npm.cmd run visual:check
```

`scripts/visual-regression.mjs` starts the local server, launches the local Chrome or Edge executable in headless + CDP mode, captures screenshots into the system temp directory, and checks the mobile home, mobile blog, mobile post empty state, and desktop home particle/title contracts without adding third-party dependencies. Mobile scenarios assert that the particle canvas stays disabled, while desktop home still guards animated particles. Visual assertion failures are never downgraded to screenshot fallback. If the current machine cannot complete real-browser screenshots, it writes a skipped report by default; with `VISUAL_STRICT=1`, CDP contract checks must be available and any assertion failure fails the command.

PowerShell may block `npm run check` because `npm.ps1` execution is disabled on the system, so `npm.cmd` is the reliable form on this machine.

## 12. Environment Variables

Required:

| Variable | Description |
|---|---|
| `NOTION_TOKEN` | Notion integration token |
| `NOTION_DATABASE_ID` | Public content database ID |

Recommended:

| Variable | Description |
|---|---|
| `SITE_URL` | Production site origin override; `site.config.json` is the checked-in fallback |

Optional:

| Variable | Default | Description |
|---|---|---|
| `NOTION_TITLE_PROPERTY_NAMES` | `Name,Title,标题` | Candidate title property names |
| `NOTION_CATEGORY_PROPERTY_NAMES` | `Category,分类` | Candidate category property names |
| `NOTION_TAGS_PROPERTY_NAMES` | `Tags,Tag,标签` | Candidate tag property names |
| `NOTION_EXCERPT_PROPERTY_NAMES` | `Excerpt,Summary,Description,摘要` | Candidate excerpt property names |
| `NOTION_DATE_PROPERTY_NAMES` | `Date,Published At,Publish Date,发布日期,发布时间` | Candidate date property names |
| `NOTION_READ_TIME_PROPERTY_NAMES` | `ReadTime,Read Time,Reading Time,阅读时间,阅读时长` | Candidate reading-time property names |
| `DATABASE_METADATA_TTL_MS` | `300000` | Database metadata cache TTL |
| `PUBLIC_PAGE_SUMMARY_CACHE_TTL_MS` | `120000` | Public list summary cache TTL |
| `PUBLIC_POST_CACHE_TTL_MS` | `60000` | Single post cache TTL |
| `NOTION_SINGLE_FLIGHT_ERROR_COOLDOWN_MS` | `2000` | Short error cooldown for database/list single-flight requests |
| `NOTION_REQUEST_TIMEOUT_MS` | `12000` | Server-side Notion request timeout |
| `NOTION_BLOCK_CHILD_CONCURRENCY` | `4` | Concurrent child block fetches |
| `NOTION_BLOCK_TOTAL_LIMIT` | `2000` | Maximum recursive Notion blocks loaded for one post |
| `IMAGE_PROXY_TIMEOUT_MS` | `10000` | Remote image proxy request timeout |
| `IMAGE_PROXY_MAX_BYTES` | `8388608` | Remote image proxy response size limit |
| `IMAGE_PROXY_MAX_REDIRECTS` | `4` | Remote image proxy redirect hop limit |
| `EXPOSE_PUBLIC_ERROR_DETAILS` | `false` | Expose upstream error detail for local debugging only |

The server exposes the entire configured Notion database. This is the deliberate long-term project policy and matches v2.5 behavior. Keep drafts in a separate Notion database; `Status`, `Public`, and similar public/published fields are ignored by the runtime.

The content schema resolver only requires a Notion title property, with `Name`, `Title`, and `标题` detected by default. Category, tags, excerpt, date, and reading-time properties are optional enhancements and can be renamed through the `NOTION_*_PROPERTY_NAMES` environment variables.

Category navigation is Notion-driven. The server reads the resolved `Category` / `分类` select property from database metadata and builds navigation from its select options, then merges any category values found in post summaries. `全部` and the configured featured category, defaulting to `精选`, are pinned. `site.config.json` only controls category presentation: featured category name, sort priority, display labels, emoji, card colors, and cover gradients. Browser code consumes the `categories` array returned by `/api/posts-data`; it no longer treats `js/notion-content.js` as the category source except for the initial `全部` / `精选` fallback before the first API response.

`site.config.json` is the single checked-in production-origin fallback used by server rendering, dynamic sitemap, and dynamic robots output. Static HTML fallback canonical and OG URLs are smoke-checked against the same config until a build-time replacement step exists.

## 13. Git Naming Rules

- Main release commits use the exact version-only message `vMAJOR.MINOR`, for example `v2.3`.
- The package version uses matching semver with patch zero, for example `v2.3` maps to `2.3.0`.
- Keep release commits linear and chronological on `main`; the newest version should sit directly above the previous version.
- When packaging a release, avoid leaving intermediate `fix:`, `docs:`, or `chore:` commits above the version commit unless the user explicitly asks for split commits.
- Kiro steering mirrors these rules in `.kiro/steering/git-rules.md`.

## 14. Checks

`scripts/inject-site-meta.mjs --check` and `scripts/smoke-check.mjs` together make up the `npm.cmd run check` entrypoint. `npm.cmd run verify:release` runs the smoke suite and `visual-regression.mjs` with `VISUAL_STRICT=1` in parallel, and the same strict command is wired into `.github/workflows/release-check.yml` across the Node 22/24 matrix for push and pull request validation. Shared harness utilities and heavier domain checks live in focused modules under `scripts/smoke-check/`:

- `harness.mjs` for VM/module loading helpers, fake DOM primitives, and common assertions.
- `api-contracts.mjs` for final API handler payload contracts such as `/api/posts-data` category presentation metadata.
- `blog-page.mjs` for blog listing, filtering, bookmark hash, and pagination behavior.
- `content-modules.mjs` for shared Notion content module boundaries and renderer helpers.
- `notion-api-client.mjs` for browser-side Notion client summary caching and session fallback behavior.
- `image-proxy.mjs` for `/api/image` SSRF, MIME, size, redirect, and method checks.
- `public-content-notion.mjs` for public error mapping and server-side Notion data behavior.
- `routing-vercel.mjs` for disabled legacy proxy, robots, sitemap, and Vercel header rules.
- `server-modules.mjs` for Notion server module boundaries, configuration, category navigation, and cache helpers.
- `visual-regression.mjs` for real-browser screenshot checks outside the default smoke suite.
- `notion-live-check.mjs` for optional live Notion database integration checks when `NOTION_TOKEN` and `NOTION_DATABASE_ID` are available.

The smoke suite currently covers:

- HTML entry structure and CSP consistency.
- Shared runtime script declarations.
- CSS ownership and line-ending rules.
- Bookmark hash routing.
- SEO runtime behavior.
- SPA navigation and page HTML request coalescing.
- SPA post-template fallback for local `/posts/:id` 404s.
- SPA route transition animation parameters.
- Blog cover preloading and mobile reveal behavior.
- Notion block and inline equation rendering through MathML instead of visible TeX code.
- Real-mobile gating for mobile-only CSS, particle density, bookmark control placement, and the article dock safe-area layout.
- Blog cover click layering.
- Remote display image proxying.
- `/api/image` private-host/DNS validation, pinned lookup behavior, redirect-hop validation, cache headers, binary response behavior, and method guard.
- API `405` and `no-store` behavior.
- Public content error mapping and `Retry-After` propagation.
- Sitemap behavior.
- Structured data shared helpers.
- SSR article injection fallback behavior.
- Mobile particle performance constraints.
- Real-browser visual regression via `npm.cmd run visual:check` for mobile/desktop screenshots and particle/title/card/dock checks; release checks require strict visual mode.
- Disabled `/api/notion` behavior.
- Notion path parameter encoding.
- Invalid TTL environment variable fallback behavior.

## 15. Known Optimization Backlog

- Non-blocking backlog items are tracked in `FIX_TODO.md`; this architecture document only keeps structural guidance.

## 16. Latest Verification

```powershell
npm.cmd run check
```

Result: passed.
