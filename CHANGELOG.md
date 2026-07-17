# Changelog

All notable changes to this project are tracked here.

## 8.6.0 - 2026-07-18 (unreleased)

Cold-load performance, cancellation, accessibility, caching, and executable release-contract hardening.

- Removed external Google Fonts, their preconnect/CSP hosts, and `font-loader.js`; the site now uses a local system font stack and respects `prefers-reduced-motion` for particles and decorative transitions.
- Added dependency-free `blog-bootstrap.js` so listing JSON starts before the lightweight list client. The blog route now loads only content Shared/Utils/URL helpers, `notion-api.js`, `bookmark.js`, and `blog-page.js`; `notion-article-renderer.js` and the full `notion-content.js` renderer remain exclusive to article routes. Page-specific modulepreloads are guarded by explicit generator markers.
- Split SPA network and preparation deadlines, passed `{ url, signal }` into page loaders, and made warmup compare parsed origins while skipping the active page. Network failures transactionally retain the old DOM/URL/SEO and expose a retry; missing/mismatched runtime versions, invalid documents, and loader/init preparation failures use one deduplicated real navigation to avoid cross-deployment asset mixing. Same-version target modulepreloads are adopted before the page loader runs.
- Added end-to-end cancellation and cumulative operation budgets for browser requests, Notion pagination/block traversal, and image proxy work. Successful public article HTML/JSON uses `s-maxage=300, stale-while-revalidate=600`; failures remain non-cacheable.
- Raised the browser list/detail and early blog-bootstrap budget to 35 seconds, five seconds beyond the complete server Notion operation budget, so valid cold pagination/recursive-block work can finish and warm shared caches instead of being repeatedly cancelled at the former 15-second per-request threshold. Server configuration and explicit operation overrides are clamped to 30 seconds so configuration cannot invert that deadline order.
- Static JS/CSS/assets now use one-year immutable caching with a deterministic content-derived `ASSET_VERSION` fingerprint that the smoke gate recomputes.
- Image and cover APIs now validate the raw query string against one generated parameter order and encoding. `/api/image` accepts only `src → sig`; `/api/cover` requires explicit `format → src → sig → w`, with no `Accept` negotiation or `Vary: Accept`, and width is always explicit. Reordered or equivalently encoded signed URLs are rejected before origin work, preventing CDN-key fragmentation from bypassing cache reuse and Sharp/origin limits.
- Canonicalized every valid Notion post id to one compact lowercase 32-character representation across public route redirects, server URL builders, browser pending/cache keys, bookmark ids, and `/api/post-data` request URLs. Valid uppercase/hyphenated HTML routes permanently redirect to `/posts/<canonical-id>`; duplicate, extra, reordered, or noncanonical data-query aliases fail before upstream work.
- Made bookmark cover signatures self-healing across key rotation: volatile cover metadata expires independently after 30 minutes, current summaries overlay immediately, failed/partial refreshes retry with bounded 5–60 second exponential backoff, `online` triggers an immediate retry, and cross-tab metadata-only storage changes dispatch an update without allowing older responses to overwrite newer refreshes.
- Replaced the fixed desktop/mobile particle split with an adaptive runtime. Widths `<=768px`, `saveData`, and `prefers-reduced-motion` disable the canvas; wider capable displays start at 350 particles, low-capability hardware starts at 120/30fps, and sustained measured frame cost can step between 350, 220, and 120 with bounded recovery.
- Hardened server cache causality: subscriber-aware single-flight cancellation stops origin work only after the final consumer leaves, and late success/failure from abandoned loaders cannot overwrite fresher cache or cooldown state. Category-filtered base page sets are reused across different local search terms, while unknown categories return empty without hitting the Notion query endpoint.
- Routed dynamic sitemap generation through the shared request lifecycle so operation deadlines and client disconnects cancel Notion work; disconnected clients produce no late response, failures remain non-cacheable, and lifecycle listeners/timers are always disposed.
- Added explicit generated-section markers, `import(versioned(...))` architecture edges, dotenv behavior tests, real local-server HTTP checks, deterministic mobile/desktop blog and full-article visual fixtures, and PWA icon metadata validation. Visual capture now polls bounded semantic page readiness, waits for card reveals plus finite CSS animations/transitions, and fails strict runs if motion cannot settle instead of sleeping for a fixed delay; it then verifies live desktop motion, seeds visual-only randomness before page scripts, normalizes infinite CSS animations to one screenshot phase, and closes Chrome through CDP before retrying transient Windows profile locks. All seven scenario names are shared by capture/approval/generation; three-sample generation rejects a maximum pairwise pixel difference above 0.25%; and baseline replacement stages every PNG before a transactional backup/install/rollback so a partial failure cannot leave a mixed set.
- Made the local API request adapter preserve the raw request URL, disconnect listeners, and `aborted` state, so canonical query rejection and lifecycle cancellation behave the same under `npm run dev` as they do after deployment. Because every public API is read-only, unsupported request bodies are drained as streams and never aggregated into memory before the handler's method guard.
- Added 192px, 512px, and maskable PWA icons; raised low-contrast text and interactive target sizes; preserved article-image dimensions only when Notion supplies both intrinsic values, while omitting unknown values instead of inventing a layout-distorting aspect ratio.
- Declared and CI-pinned `npm@11.9.0`; pinned PostCSS 8.5.19, ESLint 10.7.0, and `globals` 17.7.0; normalized fingerprinted web manifests to LF across platforms; and documented clean reproducible installation through `npm ci` / `npm.cmd ci`.
- Narrowed the declared Node runtime to `^22.13.0 || ^24.0.0`, matching the supported Node 22.13–22.x and 24.x lines exercised at their CI boundaries. Strict local visual checks fail when any scenario lacks a baseline, and all seven scenario names are shared by capture, approval, and generation tooling.
- Hardened the Linux Chrome contract after the first synchronized v8.6 run exposed two runner-specific assumptions: browser readiness now has a bounded 30-second cold-start window, and fine-pointer media emulation is installed after device metrics so Chrome cannot reset `hover` / `pointer` overrides during a viewport change. Smoke locks this ordering while the browser test retains the original layout and capability assertions.

## 8.5.0 - 2026-07-10

Image boundary, response correctness, architecture, and executable quality-gate hardening release.

- Split image transport and policy concerns out of the API handlers into `server/image-proxy.js`, `server/image-source-policy.js`, `server/image-format.js`, and `server/request-guard.js`; `/api/image` and `/api/cover` are now transport adapters rather than sharing handler internals.
- Remote image proxy URLs now carry server-issued HMAC signatures. Public post summaries and mapped image blocks receive signatures server-side, unsigned legacy payloads safely fall back to direct HTTPS images, duplicate/extra query fields are rejected, and proxy requests fail closed when no signing key is configured or an explicit secret is shorter than 32 UTF-8 bytes.
- Added bounded per-client origin rate limits and per-instance concurrency gates for raw image fetches and Sharp cover transforms. The timeout now includes initial DNS resolution; non-public special-use IP ranges, each redirect target, bytes, decoded pixels, and validated DNS pinning remain enforced.
- Replaced MIME-header trust with real raster signatures for PNG, JPEG, GIF, WebP, AVIF/HEIF, BMP, TIFF, and ICO. Arbitrary or SVG/XML bytes claiming an image MIME now receive a non-cacheable 415 response.
- Fixed image failure responses so JSON errors always use `application/json; charset=utf-8` and cannot retain stale image `Content-Type`, `Content-Length`, or `Vary` headers. Cover success headers are written only after validation and Sharp conversion succeeds.
- Cover `Accept` negotiation now respects relative quality values, returns 406 when every supported format is refused, and omits `Vary: Accept` for an explicit `format` request.
- HEAD requests now fetch and validate the real GET representation; cover HEAD also runs the bounded transform, so it cannot report cacheable success for bytes that GET would reject.
- Added ESLint 10 with browser/CommonJS/ESM-aware globals, made lint part of `npm run check`, removed dead code found by the new gate, and marked the deployment package private to prevent accidental npm publication.
- Added `scripts/architecture-check.mjs` to reject circular production dependencies and enforce browser/server/API boundaries. The Notion compatibility surface no longer carries test-only dead imports.
- GitHub Actions now runs a strict cross-platform Chrome layout contract in addition to the Node 22/24 fast gate; platform-sensitive pixel diffs remain part of the local strict release check. Workflow permissions are read-only, checkout credentials are not persisted, and reviewed checkout v7.0.0/setup-node v6.4.0 releases are pinned by full commit SHA.
- Upgraded `sharp` to 0.35.3, `postcss` to 8.5.16, and `postcss-selector-parser` to 7.1.4; added ESLint 10.6.0 and `globals` 17.7.0. Full dependency audit remains clear.
- Static CSS/JS entry URLs and `js/app.js` module imports use the `20260710-v85` cache key; package and release documentation are synchronized to 8.5.0.

## 8.4.0 - 2026-06-27

Cover-loading performance release plus the v8.3 audit cache-key follow-up.

- Added `/api/cover`, a Sharp-backed thumbnail route for remote card covers. It accepts approved widths `320`, `640`, and `960`, crops to the card aspect with attention strategy, negotiates AVIF/WebP/JPEG from `Accept`, honors `q=0` exclusions, and emits long edge-cache headers.
- Blog cards now resolve remote covers through `/api/cover`, render responsive `srcset` / `sizes`, and preload the leading covers with `imagesrcset` / `imagesizes` so mobile and desktop clients request smaller generated thumbnails instead of full upstream originals.
- `/api/image` now streams known-size raster responses after a small SVG/XML body-signature sniff, so article images can start reaching the browser without buffering the whole file first while keeping SSRF, MIME, redirect, and size guards intact.
- `js/notion-content-url.js`, `js/notion-content.js`, and `js/site-utils.js` expose shared cover URL and `srcset` helpers so browser rendering, SSR-facing modules, and smoke checks use one contract.
- The local dev server now routes `/api/cover`, and the smoke harness supports streaming writes plus native `node_modules` requires for the Sharp-backed route.
- Smoke coverage now asserts `/api/cover` WebP generation, JPEG fallback when WebP is explicitly refused, width validation, cache headers, method guards, frontend `srcset` contracts, the Sharp production dependency, and `/api/image` streaming behavior.
- Mobile home starfield CSS URLs still use the current `20260608-v84` cache key in both the real mobile media block and the `html.is-mobile-device-viewport` compatibility fallback.
- Static CSS/JS entry URLs and `js/app.js` module imports use the `20260608-v84` cache key.
- `package.json`, `package-lock.json`, README badge, `FIX_TODO.md`, and `SITE_ARCHITECTURE.md` are synced to 8.4.0.

## 8.3.0 - 2026-06-07

Public route and listing-state hardening pass from a full line-by-line audit. No visual layout changes.

- `api/post-data.js` and `api/post.js` now validate public post ids through `server/public-content.js` before calling the Notion layer. Only canonical Notion UUIDs and compact 32-character page ids are accepted; path-like ids such as `unsafe/post?debug=1` return a non-cacheable 404 without upstream work.
- Public pagination parsing is now strict across `server/public-content.js`, `server/post-service.js`, `server/notion-server.js`, `js/blog-page.js`, and `js/site-utils.js`: partially numeric values like `2abc` fall back to page 1, while canonicalizable values like `02` remain accepted as page 2.
- Blog listing state now caps category/search query input to match the public API, removes default query noise (`category=全部`, `search=`, `page=1`), and canonicalizes bookmark routes with empty query params back to `/blog.html#bookmarks`.
- `js/site-utils.js` only treats `#bookmarks` and `#bookmarks?...` as bookmark routes, so hashes that merely share the prefix (for example `#bookmarks-old`) no longer collapse into the local bookmark view.
- `js/bookmark.js` replaces raw control-character separators in bookmark snapshot keys with named escaped constants, making the source auditable while keeping the stored comparison format unchanged.
- Smoke coverage now locks the new API id guard, strict positive-integer parsing, bookmark hash prefix handling, default listing query cleanup, and empty-query bookmark route cleanup.
- Static CSS/JS entry URLs use the `20260607-v83` cache key.
- `package.json`, `package-lock.json`, README badge, `FIX_TODO.md`, and `SITE_ARCHITECTURE.md` synced to 8.3.0.

## 8.2.0 - 2026-05-29

Security and correctness hardening pass surfaced by a full code audit. No runtime rendering or visual changes.

- `scripts/smoke-check.mjs` production-domain guard now scans the git-tracked file set (`git ls-files`) instead of walking the whole working tree, keeping the filesystem walk as a fallback when git is unavailable and widening its skip list to every gitignored top-level directory. Local `npm run check` was failing because gitignored local state — `.claude/settings.local.json`, and any local `.env` whose `SITE_URL` points at the production domain — tripped the "production domain hardcoding" assertion; the scan now matches a clean CI checkout and only flags version-controlled source.
- `vercel.json` moves `X-Content-Type-Options: nosniff` from the `/api/(.*)` rule into the catch-all `/(.*)` headers block and removes the now-redundant `/api` rule, so HTML, static assets, and JSON all receive MIME-sniffing protection from a single source. `/api/image` still sets it in code. `SITE_ARCHITECTURE.md` header notes synced.
- `js/notion-api.js` raises the browser-side `REQUEST_TIMEOUT` from 8000ms to 15000ms so it stays above the server-side Notion request budget (`NOTION_REQUEST_TIMEOUT_MS`, default 12000ms); a slow-but-successful upstream response is no longer aborted client-side and surfaced as a spurious failure.
- `server/post-service.js` `queryDatabasePages` guards `data.results` with `Array.isArray` (matching `server/block-service.js`) so a malformed upstream query payload cannot throw mid-pagination.
- Static CSS/JS/SVG entry URLs use the `20260529-v82` cache key.
- `package.json` version, README badge, `FIX_TODO.md` heading, and `SITE_ARCHITECTURE.md` `> Version` synced to 8.2.0.

## 8.1.0 - 2026-05-28

Project-infrastructure release. Source-of-truth GitHub repo migrated from `aihkibq-ux/Share-everything` to `0000068/share-everything`. Runtime, API, and rendering code are byte-identical to v7.9.

- Repo migration. Previous account was suspended by GitHub; the move re-anchored the Vercel project's Git source via the dashboard's reconnect flow. `NOTION_TOKEN`, `NOTION_DATABASE_ID`, the custom domain (apex + `www` subdomain), and the `share-everything-sigma.vercel.app` alias persisted across the switch. Local `git remote` and `user.email` updated to the new account's GitHub noreply address. Vercel Node.js Version setting realigned 24.x → 22.x to remove the `package.json`/project-settings override warning.
- `.github/workflows/release-check.yml` now runs `npm ci` before the smoke gate, with `actions/setup-node@v4` caching `npm`. Previously the workflow had no install step; `import postcss from "postcss"` failed `ERR_MODULE_NOT_FOUND` on every runner, including v7.9's (a latent failure no one had noticed under the prior account).
- `.github/workflows/release-check.yml` runs `npm run check` instead of `npm run verify:release`. `scripts/visual-baselines/*.png` were captured on Windows; Linux runner font rasterisation produces a ~4.5% pixel diff that exceeds the 0.005 threshold regardless of content. `npm run verify:release` (smoke + visual:check) remains the local contract; `scripts/release-check.mjs` is unchanged. Tracked as `FIX_TODO.md` B-3.
- `scripts/visual-regression.mjs` `fs.rmSync` calls now pass `maxRetries: 10, retryDelay: 200` so transient ENOTEMPTY during Chrome user-data-dir teardown no longer fails cleanup. Discovered while testing CI fixes; affects every non-Windows host running visual:check.
- `package.json` `"engines": { "node": ">=22" }` stays per the contract enforced by `scripts/smoke-check.mjs`. Earlier exploration locked it to `"22.x"` to silence a Vercel build warning; the contract assertion required reverting.
- Pre-v8.0 deployments in Vercel still reference the suspended `aihkibq-ux/Share-everything` repo, so Instant Rollback / Redeploy on those entries fails. Tracked as `FIX_TODO.md` B-4. Day-to-day workflow unaffected.
- Static CSS/JS/SVG entry URLs use the `20260528-v81` cache key.
- `package.json` version, README badge, `FIX_TODO.md` heading, and `SITE_ARCHITECTURE.md` `> Version` synced to 8.1.0; smoke check version invariants now stable.

## 7.9.0 - 2026-05-21

- Restored blog card cover proxying through `/api/image?src=...` by switching `js/site-utils.js` to lazy `window.NotionContent` lookup; the previous IIFE-time capture only ever saw `NotionContentShared`, which has no URL helpers, so the proxy branch was unreachable in production.
- Fixed a bookmark hydration race: `js/bookmark.js` now collects hydrated entries into a `Map<id, entry>`, re-reads localStorage before save, and merges by id so a concurrent `toggle()` during the network await window is no longer overwritten by the pre-hydration snapshot.
- `js/bookmark.js` cross-tab `storage` event compares the new bookmark snapshot key against the previous one and skips the `bookmarks:updated` dispatch when the set hasn't changed.
- `js/notion-api.js` merged the parallel `postSummaryMemoryCache` + `postSummaryTimestampCache` maps into a single `Map<id, {summary, timestamp}>` and now `return await response.json()` so the timeout signal covers JSON parse.
- `api/post.js` `applyPatches` now throws on overlapping ranges instead of silently corrupting the SSR template; pure same-offset insertions still coexist.
- Centralized the OpenGraph share image path: `js/notion-content-shared.js` exports `DEFAULT_SHARE_IMAGE_PATH = "/og-image.jpg?v=4"` and `api/post.js`, `server/render-service.js`, `js/spa-router.js`, `js/seo-meta.js`, `js/post-page.js`, `js/notion-content.js`, `scripts/inject-site-meta.mjs`, and `scripts/smoke-check.mjs` all read from the constant.
- `js/spa-router.js` SPA navigation excludes the global stylesheet by exact `URL.pathname === "/css/style.css"` match instead of the fragile `[href*="style.css"]` substring filter.
- `scripts/local-server.mjs` adds `node_modules` to the static-serve denylist so the dev server no longer exposes dependency files.
- `css/style.css` split the touch-media `.hero-search input` + `.blog-search input` shared block to eliminate immediately-overridden declarations; `npm.cmd run mobile:fallbacks` regenerated the mirror inside `html.is-mobile-device-viewport`.
- `js/notion-content.js` `mapNotionPage` filters Notion multi_select tag names through `normalizePostTags` so nullish or empty entries are dropped before rendering.
- Static assets now use the v7.9 cache key.

## 7.8.0 - 2026-05-18

- Mobile overview card aspect rebalanced to mild landscape (`1 / 0.94`) so the cover image gets clear horizontal dominance without the card feeling tall.
- Card cover/body split shifted to `0.66fr / 0.34fr` (cover ~66%) so the cover image looks like a proper poster instead of a squashed strip.
- Card grid max-width shrunk `500px → 460px` and gap `10px → 11px` so the 2-column grid feels less overwhelming.
- Card body padding tightened (7×8 → 6×8, row-gap 4 → 2, column-gap 6 → 5, bookmark column 26px → 24px) so the category chip + title row reads as a single compact line.
- Dock kept exactly at v7.7 styling (user feedback: previous dock was good).
- Static assets now use the v7.8 cache key.

## 7.7.0 - 2026-05-18

- Mobile overview card aspect-ratio dialed back from v7.6's `1 / 1.12` (too tall) to `1 / 1.04` — only ~4% taller than wide, balanced without leaning aggressive portrait.
- Mobile overview bottom dock is now taller and rounder: container padding 4px → 6px, button min-height 34px → 42px, button padding 7×12 → 10×14, icon 14px → 15px, font-size 0.74rem → 0.78rem. Container picks up a soft outer drop shadow for visual lift.
- Narrow-mobile (≤540px) dock proportionally bumped too: button min-height 30px → 38px.
- Strictly mobile-scoped change: only `body[data-page="blog"]` rules and mobile `.blog-card` aspect-ratio modified; desktop CSS untouched.
- Static assets now use the v7.7 cache key for fresh deployed loads.

## 7.6.0 - 2026-05-18

- Refined v7.5 based on real-device feedback: mobile overview cards switched from near-square (`1 / 0.86`) to a proper portrait aspect (`1 / 1.12`) so the cover image gets vertical room while the body stays compact.
- Mobile overview bottom dock reintroduces a slim unified container (segmented-control feel) instead of three free-floating pills: subtle white gradient backplate (`rgba(255,255,255,0.05→0.02)`), thin cyan-tinted border (`rgba(137,224,255,0.14)`), 4px padding, pill border-radius.
- Individual nav buttons inside the dock are now transparent by default with a soft white-tint active state — the unified container provides visual cohesion while individual buttons stay quiet.
- Strictly mobile-scoped change: only `body[data-page="blog"]` rules and mobile `.blog-card` aspect-ratio were modified; desktop CSS is unchanged.
- Static assets now use the v7.6 cache key for fresh deployed loads.

## 7.5.0 - 2026-05-18

- Redesigned the mobile overview bottom dock to match the lightweight `返回列表` pill style: removed the heavy outer tray, gradient backplate, and stacked drop shadows; each nav button is now an independent soft-white pill with a thin cyan border and a single inset highlight.
- Slightly flattened the mobile overview card aspect ratio (`1 / 1` → `1 / 0.86`) so the 2-column card grid takes 14% less vertical space and feels more balanced against the page header.
- Strictly mobile-scoped change: only `body[data-page="blog"]` rules inside the mobile media query and the `.is-mobile-device-viewport` fallback were modified, plus mobile blog card aspect-ratio; desktop CSS is unchanged.
- Refreshed mobile and desktop visual baselines (desktop baseline drift is title-gradient animation timing noise — no desktop CSS changed).
- Static assets now use the v7.5 cache key for fresh deployed loads.

## 7.4.0 - 2026-05-16

- Retuned the mobile home center glow toward a softer cyan halo that wraps the title area instead of dominating it.
- Both the mobile starry SVG glow gradients and the CSS hero halo now use lower opacity teal-tinted stops, and the halo is lifted upward so the title sits at its visual center.
- Strictly mobile-scoped change: the only modified CSS rules are the two mobile `.hero-section::after` blocks; desktop hero rendering is unchanged.
- Refreshed only the mobile home visual baseline; the desktop baseline is intentionally preserved from v7.3.
- Static assets now use the v7.4 cache key for fresh deployed loads.

## 7.3.0 - 2026-05-16

- Reworked the mobile home starfield with denser fine stars and a stronger center glow.
- Tightened the mobile overview search, category filters, card details, and bottom dock for a lighter mobile UI.
- Updated mobile layout smoke contracts for the compact visual scale.
- Static assets now use the v7.3 cache key for fresh deployed loads.

## 7.2.0 - 2026-05-16

- Mobile fallback CSS generator now skips `@keyframes` step selectors so future keyframe blocks inside touch media queries do not produce invalid CSS.
- Image proxy now sniffs response body magic bytes for SVG/XML signatures and rejects with 415 even when the upstream `Content-Type` claims a raster image, adding defense in depth on top of the existing MIME allow-list.
- Renamed `BOOKMARK_METADATA_VERSION` to `BOOKMARK_METADATA_HYDRATION_GENERATION` with an explanatory comment — the value is a "force re-hydrate on read" trigger, not a schema version (no migration logic exists).
- Static assets now use the v7.2 cache key for fresh deployed loads.

## 7.1.0 - 2026-05-16

- SSR article rendering now parses `post.html` once per render path and accumulates DOM source-range patches through a shared template editor.
- Head metadata, skeleton visibility, article content, initial JSON, and JSON-LD insertion now apply in one patch pass on the success path.
- The existing helper tests still exercise string-input wrappers while smoke checks lock the parse-once success path.
- Static assets now use the v7.1 cache key for fresh deployed loads.

## 7.0.0 - 2026-05-16

- Added a PostCSS-based mobile fallback generator for `html.is-mobile-device-viewport` compatibility CSS.
- `npm.cmd run check` now verifies generated mobile fallback CSS before static metadata and smoke checks.
- Removed the stale hand-written fallback parity burden from the smoke suite and let generated CSS plus visual regression guard the mobile contract.
- Static assets now use the v7.0 cache key for fresh deployed loads.

## 6.10.0 - 2026-05-16

- 修复 SSR 路径上一处中文字符串编码损坏（fallback empty state link 默认值）。
- 恢复 SSR 响应 CSP header 的 per-request nonce，为未来 inline executable script 保留可选 opt-in 路径。
- 抽出 normalizeColorName helper，纠正 site-utils 与 block-service 几处注释的精度问题。
- 真正删除 bookmark CSS.escape fallback 的死代码（替代 v6.9 的扩写 fallback）。
- 清理 html-rewriter 9 个未使用的 export，统一到共享 escapeHtmlAttribute。
- 新增 SSR 成功路径 CSP nonce 自动化断言，弥补 v6.5 覆盖缺口。

## 6.9.0 - 2026-05-16

- JSON-LD and initial JSON data-block scripts no longer carry decorative CSP nonces.
- Runtime structured-data syncing now treats JSON-LD as inert data blocks instead of nonce-bearing executable scripts.
- Bookmark selector escaping now has a spec-compatible fallback for older browsers without `CSS.escape`.
- The local API dev server now forwards parsed request bodies to handlers.
- Static assets now use the v6.9 cache key for fresh deployed loads.

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
