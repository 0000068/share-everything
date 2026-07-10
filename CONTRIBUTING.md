# Contributing

Thanks for taking a look at Share Everything.

This project is best treated as an early open-source Notion + Vercel personal blog template. Please keep changes small, documented, and aligned with the no-framework vanilla JS direction.

## Local Checks

Use Windows-friendly commands from PowerShell:

```powershell
npm.cmd run check
npm.cmd run verify:release
```

`check` 依次执行 ESLint、生产模块边界/循环依赖检查、生成文件一致性检查和 smoke suite。`verify:release` 在此基础上并行执行严格的真实浏览器与 Windows 像素 baseline 回归。Pull request CI 还会在 Linux Chrome 中执行不依赖平台字体像素的结构契约。

`notion:live-check` is optional and requires real `NOTION_TOKEN` and `NOTION_DATABASE_ID` values.

## Pull Requests

- Explain the user-visible behavior change.
- Include screenshots for visual changes when useful.
- Keep server concerns in the focused modules under `server/`.
- Keep frontend dependencies explicit through `js/app.js`.
- Keep remote-image network policy in `server/image-proxy.js`, source authorization in `server/image-source-policy.js`, and byte-format detection in `server/image-format.js`; API handlers should compose these modules rather than import another handler.
- Add behavior-focused tests for boundary changes. Image endpoints must preserve signed-source authorization, real raster validation, JSON error MIME, SSRF protection, and bounded origin work.
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
