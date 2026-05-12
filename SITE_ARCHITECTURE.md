# Share Everything Site Architecture

> Version: v3.4
> Updated: 2026-05-12

## 1. Overview

Share Everything is a small static-first site with Notion as the content source, Vercel Serverless Functions as the public content layer, and vanilla HTML/CSS/JS on the frontend.

It is not a React, Next.js, Vue, Cloudflare Workers, or Cloudflare Pages app. Cloudflare only handles DNS.

| Layer | Technology | Responsibility |
|---|---|---|
| Content source | Notion API | Article metadata and block content |
| Server | Vercel Serverless Functions | Public list API, post data API, SSR post HTML, sitemap, image proxy |
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
      -> /api/sitemap
        -> Browser
          -> Static HTML shell
          -> Lightweight SPA navigation
          -> localStorage bookmarks
```

## 2. Version v3.4 Highlights

v3.4 is a mobile article compatibility hotfix for long URLs and browser-specific layout width handling.

- `css/post-page.css` now forces article content, paragraphs, links, and list items to break long URL-like strings before they widen the layout.
- Mobile article wrappers are clamped to `100%` width with `min-width: 0` to avoid Brave/vivo-style horizontal overflow and right-side background seams.
- `scripts/smoke-check.mjs` now asserts the long-word wrapping and mobile article wrapper clamp rules.

### v3.3 Highlights

v3.3 focuses the mobile experience on stable reading and lighter rendering while preserving the desktop particle UI.

- `js/common.js` keeps the old desktop particle class, 350-particle density, and desktop frame cadence unchanged.
- Real mobile home pages now use a separate `MobileParticle` model, 28 particles, and a 66ms draw interval to reduce phone CPU/GPU cost.
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
| `/sitemap.xml` | `/api/sitemap` | Dynamic sitemap |

## 4. API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/posts-data` | `GET` | Public post list JSON |
| `/api/post-data` | `GET` | Single post JSON |
| `/api/post` | `GET` | SSR article HTML |
| `/api/image` | `GET` | Same-origin remote image proxy |
| `/api/sitemap` | `GET` | Dynamic sitemap XML |
| `/api/notion` | Any | Disabled legacy proxy, fixed `410` |

Read-only public APIs reject non-`GET` methods with `405` and `Cache-Control: no-store`.

## 5. Caching

| Resource | Cache-Control |
|---|---|
| Static HTML and `/` | `public, max-age=0, must-revalidate` |
| CSS and JS | `public, max-age=3600, stale-while-revalidate=86400` |
| `favicon.png` | `public, max-age=86400` |
| Successful `/api/image` responses | `public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400` |
| Public JSON and SSR post HTML | `no-store` |
| Public API errors | `no-store` |
| Disabled `/api/notion` | `no-store` |

`vercel.json` does not set an API-wide `Cache-Control`; individual handlers own their cache policy so `/api/image` can stay edge-cacheable while data and SSR routes stay non-cacheable. Do not add a catch-all `/api/*` `Cache-Control` header in `vercel.json`.

Client-side `notion-api.js` keeps a short bounded in-memory post-list response cache for fast repeated listing transitions. It also keeps up to 200 post summaries in memory plus `sessionStorage` for bookmark hydration.

## 6. Security

- Global Vercel headers keep frame protection through `frame-ancestors 'none'` and `X-Frame-Options: DENY`.
- Static pages use CSP meta tags generated from `server/security-policy.js`.
- SSR article pages generate request-scoped nonces for CSP, JSON-LD, and initial post data.
- `connect-src` remains same-origin so browser data requests continue through semantic API routes.
- `/api/image` only accepts `https:` upstream URLs, rejects localhost/private literal hosts and private DNS results, pins the validated DNS answer to the actual HTTPS request through a custom lookup, validates every redirect hop manually, enforces image content types, limits image size, applies a timeout, and sends `X-Content-Type-Options: nosniff`.
- Public error details are hidden unless `EXPOSE_PUBLIC_ERROR_DETAILS=true` is set for local debugging.

## 7. Repository Structure

```text
.
|-- index.html
|-- blog.html
|-- post.html
|-- package.json
|-- vercel.json
|-- robots.txt
|-- favicon.png
|-- SITE_ARCHITECTURE.md
|-- api/
|   |-- image.js
|   |-- posts-data.js
|   |-- post-data.js
|   |-- post.js
|   |-- sitemap.js
|   `-- notion.js
|-- server/
|   |-- notion-server.js
|   |-- public-content.js
|   `-- security-policy.js
|-- js/
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

### Script Load-Order Dependency Graph

The `data-spa-runtime` scripts MUST load in the order declared in the HTML files. The
following graph shows which `window.*` globals each script exposes (▸) and consumes (◂):

```
  font-loader.js
    (no dependencies — safe to load at any position)

  notion-content.js
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

Page-specific scripts (`notion-api.js`, `bookmark.js`, `blog-page.js`, `post-page.js`,
`index-page.js`) are loaded after the runtime set and may safely reference any of the
globals listed above.

`spa-router.js` MUST be loaded **last** among the runtime scripts because it initializes
link interception immediately on load and depends on all preceding globals.

`spa-router.js` keeps canonical URLs in the address bar, but can load `/post.html?id=...` as a compatibility fallback when a server returns `404` for `/posts/:id`. On local dev origins such as `127.0.0.1` and `localhost`, it loads that static post template first because the local static server does not rewrite `/posts/:id`. Route changes use the v1.6-style whole-page opacity/transform cadence with a short 150ms visual exit cue, then suppress nested first-load animations after the swap so the transition reads as one calm page movement. Same-path hash-only changes are intentionally passed through to native browser handling; `blog-page.js` owns the `hashchange` flow for `/blog.html#bookmarks`. If a route remains in its exit state too long, the router falls back to a local-compatible full navigation instead of leaving the page transparent or non-clickable.

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

`server/notion-server.js` handles:

- Database metadata and schema resolution.
- Public content access policy.
- Post list querying, filtering, search, and pagination.
- Single post fetching.
- Recursive block fetching with concurrency limits.
- SSR article content and structured data preparation.
- Notion error classification by resource type.

Main server-side caches:

| Object | Location | TTL / Size |
|---|---|---|
| Database metadata | Memory | 5 minutes |
| Public post summaries | Memory | 2 minutes |
| Filtered results | Memory Map | Follows summary cache |
| Single post details | Memory LRU | 60 seconds / 20 entries |
| In-flight post requests | Promise Map | Request lifetime |

## 11. Local Development

Use:

```powershell
npm.cmd run dev
```

This starts `scripts/local-server.mjs` on `127.0.0.1:4173` by default and supports static assets plus semantic API routes including `/api/image`, `/api/post`, `/api/post-data`, `/api/posts-data`, and `/api/sitemap`.

Use:

```powershell
npm.cmd run check
```

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
| `SITE_URL` | Production site origin |

Optional:

| Variable | Default | Description |
|---|---|---|
| `DATABASE_METADATA_TTL_MS` | `300000` | Database metadata cache TTL |
| `PUBLIC_PAGE_SUMMARY_CACHE_TTL_MS` | `120000` | Public list summary cache TTL |
| `PUBLIC_POST_CACHE_TTL_MS` | `60000` | Single post cache TTL |
| `NOTION_REQUEST_TIMEOUT_MS` | `12000` | Server-side Notion request timeout |
| `NOTION_BLOCK_CHILD_CONCURRENCY` | `4` | Concurrent child block fetches |
| `IMAGE_PROXY_TIMEOUT_MS` | `10000` | Remote image proxy request timeout |
| `IMAGE_PROXY_MAX_BYTES` | `8388608` | Remote image proxy response size limit |
| `IMAGE_PROXY_MAX_REDIRECTS` | `4` | Remote image proxy redirect hop limit |
| `EXPOSE_PUBLIC_ERROR_DETAILS` | `false` | Expose upstream error detail for local debugging only |

The server exposes the entire configured Notion database. This is the deliberate long-term project policy and matches v2.5 behavior. Keep drafts in a separate Notion database; `Status`, `Public`, and similar public/published fields are ignored by the runtime.

## 13. Git Naming Rules

- Main release commits use the exact version-only message `vMAJOR.MINOR`, for example `v2.3`.
- The package version uses matching semver with patch zero, for example `v2.3` maps to `2.3.0`.
- Keep release commits linear and chronological on `main`; the newest version should sit directly above the previous version.
- When packaging a release, avoid leaving intermediate `fix:`, `docs:`, or `chore:` commits above the version commit unless the user explicitly asks for split commits.
- Kiro steering mirrors these rules in `.kiro/steering/git-rules.md`.

## 14. Checks

`scripts/smoke-check.mjs` is the single `npm.cmd run check` entrypoint. Shared harness utilities and heavier domain checks live in focused modules under `scripts/smoke-check/`:

- `harness.mjs` for VM/module loading helpers, fake DOM primitives, and common assertions.
- `blog-page.mjs` for blog listing, filtering, bookmark hash, and pagination behavior.
- `notion-api-client.mjs` for browser-side Notion client summary caching and session fallback behavior.
- `image-proxy.mjs` for `/api/image` SSRF, MIME, size, redirect, and method checks.
- `public-content-notion.mjs` for public error mapping and server-side Notion data behavior.
- `routing-vercel.mjs` for disabled legacy proxy, sitemap, and Vercel header rules.

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
- Disabled `/api/notion` behavior.
- Notion path parameter encoding.
- Invalid TTL environment variable fallback behavior.

## 15. Known Optimization Backlog

- No open structural optimization backlog items are currently tracked here.

## 16. Latest Verification

```powershell
npm.cmd run check
```

Result: passed.
