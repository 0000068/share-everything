# Contributing

Thanks for taking a look at Share Everything.

This project is best treated as an early open-source Notion + Vercel personal blog template. Please keep changes small, documented, and aligned with the no-framework vanilla JS direction.

## Local Checks

Use Node.js 22.13.0–22.x or Node.js 24.x; this matches the versions covered by CI and the repository's `engines` contract.

Install the exact dependency tree first:

```bash
npm ci
```

The repository and CI pin `npm@11.9.0` through `packageManager`; if `npm --version` differs, run `npm install --global npm@11.9.0` before the clean install. On Windows PowerShell, use `npm.cmd ci`. Then run the release gates on macOS/Linux:

```bash
npm run check
npm run verify:release
```

Or from Windows PowerShell:

```powershell
npm.cmd run check
npm.cmd run verify:release
```

`check` 依次执行 ESLint、生产模块边界/循环依赖检查、生成文件一致性检查、性能契约和 smoke suite。`verify:release` 在此基础上并行执行严格的真实浏览器与本机像素 baseline 回归；缺失任何已声明场景的 baseline 会失败。Pull request CI 还会在 Linux Chrome 中执行不依赖平台字体像素的结构契约。

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
