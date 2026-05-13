# Contributing

Thanks for taking a look at Share Everything.

This project is best treated as an early open-source Notion + Vercel personal blog template. Please keep changes small, documented, and aligned with the no-framework vanilla JS direction.

## Local Checks

Use Windows-friendly commands from PowerShell:

```powershell
npm.cmd run check
npm.cmd run verify:release
```

`notion:live-check` is optional and requires real `NOTION_TOKEN` and `NOTION_DATABASE_ID` values.

## Pull Requests

- Explain the user-visible behavior change.
- Include screenshots for visual changes when useful.
- Keep server concerns in the focused modules under `server/`.
- Keep frontend dependencies explicit through `js/app.js`.
- Do not add production-domain literals outside the documented fallback files.

## Project Scope

Good fits:

- Notion database compatibility fixes.
- Vanilla JS runtime improvements.
- Security, caching, routing, and rendering hardening.
- Documentation for self-hosting and configuration.

Poor fits:

- Framework rewrites.
- Assumptions that every fork is production-ready without configuration.
- Features that require private Notion content to be exposed.
