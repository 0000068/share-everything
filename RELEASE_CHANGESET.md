# Release Changeset Draft

Updated: 2026-06-07

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

2. Public API and Notion service hardening
- `api/post-data.js`
- `api/post.js`
- `server/public-content.js`
- `server/post-service.js`
- `server/notion-server.js`

3. Browser listing and bookmark behavior
- `js/blog-page.js`
- `js/site-utils.js`
- `js/bookmark.js`

4. Smoke and contract checks
- `scripts/smoke-check.mjs`
- `scripts/smoke-check/api-contracts.mjs`
- `scripts/smoke-check/blog-page.mjs`
- `scripts/smoke-check/public-content-notion.mjs`

## Summary

- Public post routes now reject invalid path-like ids before contacting Notion.
- Public pagination parsing is strict across server helpers, Notion service code, and client listing state.
- Blog listing URLs now remove default query noise and canonicalize empty-query bookmark routes.
- Bookmark hash parsing no longer over-matches unrelated hash prefixes.
- Bookmark snapshot separators are named escaped constants instead of raw control-character bytes.
- Static entry URLs use the `20260607-v83` cache key and release metadata is synced to `8.3.0`.

## Commit Boundary Suggestion

Prefer a single release commit if the project is keeping version-only release commits.
If this needs to be split for review, use this order:

1. Public API / service hardening.
2. Browser listing and bookmark canonicalization.
3. Smoke and contract checks.
4. Release metadata, cache busting, and documentation updates.

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
