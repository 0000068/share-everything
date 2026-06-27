# Release Changeset Draft

Updated: 2026-06-27

## Scope

This working tree contains one release-sized change set with these review groups:

1. Cover thumbnail and image streaming runtime
- `api/cover.js`
- `api/image.js`
- `js/blog-page.js`
- `js/notion-content-url.js`
- `js/notion-content.js`
- `js/site-utils.js`
- `scripts/local-server.mjs`
- `package.json`
- `package-lock.json`

2. Smoke and contract checks
- `scripts/smoke-check.mjs`
- `scripts/smoke-check/harness.mjs`
- `scripts/smoke-check/image-proxy.mjs`
- `scripts/smoke-check/content-modules.mjs`

3. Release documentation
- `README.md`
- `CHANGELOG.md`
- `FIX_TODO.md`
- `SITE_ARCHITECTURE.md`
- `RELEASE_CHANGESET.md`

## Summary

- `/api/cover` generates card-cover thumbnails at approved widths `320`, `640`, and `960`, with Sharp-backed 16:9 cropping, AVIF/WebP/JPEG negotiation, long edge caching, and `q=0` fallback handling.
- Blog card covers now use responsive `srcset` / `sizes`; preload links use `imagesrcset` / `imagesizes` so clients select smaller generated thumbnails for the current viewport.
- `/api/image` streams known-size raster image responses after the SVG/XML signature sniff, keeping the existing safety envelope while improving article image first-byte behavior.
- Local development, smoke harnesses, architecture docs, README, changelog, and fix tracking are synced to the v8.4 cover-loading contract.
- The earlier mobile starfield cache-key consistency fix remains in the v8.4 release scope.

## Commit Boundary Suggestion

Prefer a single release commit if the project is keeping version-only release commits.
If this needs to be split for review, use this order:

1. Cover thumbnail API and frontend responsive loading.
2. Image proxy streaming and local dev support.
3. Smoke guards.
4. Release metadata and documentation updates.

## Validation Status

Passed locally:

```powershell
npm.cmd run check
npm.cmd run verify:release
npm.cmd audit --omit=dev
git diff --check
```

`npm run notion:live-check` is a repeatable live integration check. In this
workspace it currently reports a skip because no local `NOTION_TOKEN` or
`NOTION_DATABASE_ID` environment values are present. Set `NOTION_LIVE_STRICT=1`
when the check must fail instead of skip on missing credentials.
