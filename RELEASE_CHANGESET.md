# Release Changeset Draft

Updated: 2026-06-08

## Scope

This working tree contains one release-sized change set with these review groups:

1. Release metadata and cache busting
- `package.json`
- `package-lock.json`
- `README.md`
- `CHANGELOG.md`
- `FIX_TODO.md`
- `SITE_ARCHITECTURE.md`
- `RELEASE_CHANGESET.md`
- `index.html`
- `blog.html`
- `post.html`
- `js/app.js`
- `css/style.css`

2. Smoke and contract checks
- `scripts/smoke-check.mjs`

## Summary

- Mobile home starfield CSS URLs now use the current `20260608-v84` cache key in both mobile rendering paths.
- Smoke coverage now asserts the starfield background URL follows the shared `ASSET_VERSION` and rejects the stale `20260516-v78` URL.
- Static entry URLs use the `20260608-v84` cache key and release metadata is synced to `8.4.0`.

## Commit Boundary Suggestion

Prefer a single release commit if the project is keeping version-only release commits.
If this needs to be split for review, use this order:

1. Cache-key consistency fix.
2. Smoke guard.
3. Release metadata and documentation updates.

## Validation Status

Passed locally:

```powershell
npm run check
npm run verify
npm audit --audit-level=moderate
git diff --check
```

`npm run notion:live-check` is a repeatable live integration check. In this
workspace it currently reports a skip because no local `NOTION_TOKEN` or
`NOTION_DATABASE_ID` environment values are present. Set `NOTION_LIVE_STRICT=1`
when the check must fail instead of skip on missing credentials.
