# Release Changeset

Updated: 2026-07-10
Target: v8.5.0

## Scope

This working tree is one release-sized quality and production-boundary change set. The intentionally public Notion database remains public; authorization added here is scoped to remote-image proxy use.

### 1. Image boundary and runtime

- `api/image.js`, `api/cover.js`
- `server/image-source-policy.js`, `server/image-proxy.js`, `server/image-format.js`, `server/request-guard.js`
- `server/post-service.js`, `server/public-content.js`
- `js/notion-content-url.js`, `js/notion-content.js`, `js/site-utils.js`, `js/notion-api.js`, `js/blog-page.js`, `js/bookmark.js`
- `scripts/local-server.mjs`

### 2. Executable quality gates and tests

- `eslint.config.mjs`, `scripts/architecture-check.mjs`
- `scripts/smoke-check.mjs`
- `scripts/smoke-check/image-proxy.mjs`, `scripts/smoke-check/content-modules.mjs`, and shared harness updates
- `scripts/visual-regression.mjs`
- `.github/workflows/release-check.yml`

### 3. Release metadata and documentation

- `package.json`, `package-lock.json`, `.env.example`
- Runtime asset keys in HTML, CSS, and `js/app.js`
- `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `FIX_TODO.md`, `SITE_ARCHITECTURE.md`

## Behavioral Summary

- Public content payloads carry server-issued HMAC signatures for remote cover and article image sources. Image handlers reject missing, malformed, tampered, duplicated, and extra-query authorization inputs before network access.
- The proxy transport is isolated from HTTP response handling and retains HTTPS-only SSRF defenses, DNS answer pinning, redirect-hop revalidation, time/size limits, and bounded body reads.
- Declared image MIME is no longer trusted alone. Actual raster signatures determine the canonical success type; arbitrary JSON or active XML/SVG cannot be cached as an image.
- Image failures always use JSON MIME and `no-store`; image success headers are written only after validation or conversion succeeds.
- Per-client fixed-window limits and per-instance concurrency gates bound uncached origin fetches and Sharp work.
- Cover negotiation honors weighted `Accept` semantics, exact exclusions, `406`, explicit formats, and correct `Vary` behavior.
- Legacy cached client payloads without signatures fall back to direct external HTTPS images instead of reopening the same-origin proxy.

## Architecture and Quality Summary

- API handlers compose focused server modules; API-to-API handler imports are prohibited.
- ESLint models browser, CommonJS, UMD, and ESM files separately and runs in the default check.
- The architecture checker rejects circular production dependencies and browser/server/API boundary inversions.
- Behavior-focused image tests cover authorization, byte formats, errors, resource guards, SSRF, streaming, transformation, and negotiation.
- CI retains Node 22/24 checks and adds a strict Linux Chrome structure/behavior contract. Local release verification retains the Windows pixel baseline. Workflow permissions are read-only, checkout credentials are not persisted, and reviewed action releases are full-SHA pinned.
- Package publishing is disabled with `private: true`; runtime and tooling dependencies are exact and current at audit time.

## Suggested Review Order

1. Image source authorization and server-side signature propagation.
2. Shared transport, format detection, and resource guards.
3. Raw/cover handlers and browser URL compatibility.
4. Behavior tests, lint, architecture gate, and CI.
5. Version, asset keys, environment documentation, and release notes.

## Validation Status

Passed locally and repeated immediately before commit on 2026-07-10:

```powershell
npm.cmd test
npm.cmd run verify:release
npm.cmd audit --audit-level=low
npm.cmd audit --omit=dev
npm.cmd outdated --long
npm.cmd ci --dry-run
git diff --check
```

- ESLint: zero warnings.
- Architecture: 43 production modules, no missing imports, boundary violations, or cycles.
- Smoke suite: passed.
- Strict real-browser and Windows pixel regression: passed.
- Direct dependency update check: no outdated packages.
- Full and production dependency audits: 0 vulnerabilities.
- Clean-install lockfile dry-run: passed.
- Diff whitespace check: passed.
- Remote preflight: fetched `origin/main`; local `HEAD` and `origin/main` reported `0 0` divergence before commit.

`npm.cmd run notion:live-check` completed with its documented safe skip because this workspace does not provide local `NOTION_TOKEN` / `NOTION_DATABASE_ID` values.
