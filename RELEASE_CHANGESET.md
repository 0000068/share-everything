# Release Changeset

Updated: 2026-09-09
Target: v8.7.0

## Problem and resulting behavior

Opening a canonical article on the live site returned a 308 redirect to the same URL. The browser eventually reported `ERR_TOO_MANY_REDIRECTS`; SPA feedback displayed a generic network failure while the direct SSR endpoint still returned the article successfully.

`api/post.js` now accepts the exact matching `id` injected by Vercel's rewrite alongside the canonical public path. Extra, duplicate, malformed, and noncanonical query/path variants remain normalized before content loading. Future redirects require browser revalidation. SPA article requests can recover from transport/404 failures through the direct SSR endpoint, retaining the public address, and their 35-second deadline accommodates the complete 30-second server budget.

## Additional audit repairs

- Real lightweight URL helpers preserve signed bookmark covers on initial list entry. Compact session summaries are marked partial and cannot overwrite complete persisted metadata. Generation 7 refreshes damaged older bookmarks.
- Table rows render once; archived and trashed pages fail public access checks. Active pages in the dedicated Notion database remain intentionally public.
- Page initialization owns final category/search/bookmark SEO after template defaults, and pagination updates canonical metadata. Classification identifiers retain 128 characters, and the homepage uses its generated featured-category link.
- Bootstrap errors preserve server codes and retry timing for accurate feedback. Sharp 0.35.4, PostCSS 8.5.28, and patched transitive dependencies replace the vulnerable versions. Runtime parser `parse5` belongs to production dependencies.
- Regression checks load actual browser modules together and cover both list/article entry paths, storage reload/migration, long categories, table semantics, rewrite-shaped SSR requests, cross-page metadata, transport recovery, a valid 16-second article response, and server diagnostics.

## Validation

Completed locally on Windows with Node 24.14.0 and npm 11.9.0:

- `npm.cmd run check`: lint, 45-module architecture checks, generated assets, and smoke/integration regressions passed.
- `VISUAL_STRICT=1 npm.cmd run visual:check`: all seven desktop/mobile scenarios passed against the existing pixel baselines.
- `npm.cmd audit --audit-level=low` and `npm.cmd audit --omit=dev`: zero known vulnerabilities.
- A separate temporary directory installed only production dependencies with `npm ci --omit=dev`; actual dynamic `parse5` imports rendered successful canonical/rewrite/API article pages and 404 fallback pages. Native Sharp generated and decoded a WebP image.
- Asset generation/stamping completed and `git diff --check` passed.

The final combined release gate runs before committing. Post-deployment public HTTP and browser results are recorded in local `.output/repair/` and `output/playwright/` artifacts after the production deployment finishes.

Notion credentials are not present in the local workspace. Credentialed `notion:live-check` is therefore unavailable locally; public production HTTP and browser checks separately validate the deployed content path.
