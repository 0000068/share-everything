# Release Changeset Draft

Updated: 2026-05-13

## Scope

This working tree contains one release-sized change set with these review groups:

1. Release verification and CI
- `package.json`
- `scripts/release-check.mjs`
- `scripts/notion-live-check.mjs`
- `scripts/visual-regression.mjs`
- `.github/workflows/release-check.yml`

2. Notion server content flow
- `server/notion-server.js`
- `server/notion-config.js`
- `server/category-navigation.js`
- `site.config.json`
- `.env.example`

3. Shared Notion rendering modules
- `js/notion-content-shared.js`
- `js/notion-content-utils.js`
- `js/notion-content-url.js`
- `js/notion-article-renderer.js`
- `js/notion-content.js`
- `index.html`
- `blog.html`
- `post.html`

4. Browser API and page behavior
- `js/notion-api.js`
- `js/blog-page.js`

5. Smoke and contract checks
- `scripts/smoke-check.mjs`
- `scripts/smoke-check/api-contracts.mjs`
- `scripts/smoke-check/content-modules.mjs`
- `scripts/smoke-check/server-modules.mjs`
- `scripts/smoke-check/blog-page.mjs`
- `scripts/smoke-check/notion-api-client.mjs`
- `scripts/smoke-check/public-content-notion.mjs`

6. Documentation
- `README.md`
- `SITE_ARCHITECTURE.md`
- `RELEASE_CHANGESET.md`

## Commit Boundary Suggestion

Prefer a single release commit if the project is keeping version-only release commits.
If this needs to be split for review, use this order:

1. Verification workflow and release check script.
2. Notion server/category/config split.
3. Shared content module split and HTML runtime order.
4. API/page behavior plus contract checks.
5. Documentation updates.

## Validation Status

Passed locally:

```powershell
npm.cmd run check
npm.cmd run verify:release
npm.cmd run notion:live-check
```

`npm.cmd run notion:live-check` is a repeatable live integration check. In this
workspace it currently reports a skip because no local `NOTION_TOKEN` or
`NOTION_DATABASE_ID` environment values are present. Set `NOTION_LIVE_STRICT=1`
when the check must fail instead of skip on missing credentials.
