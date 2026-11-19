# v8.13 过载状态码契约、依赖清零与边界加固

Updated: 2026-11-19
Target: v8.13.0

- 服务端 `getPublicContentErrorStatus` 保留本地并发过载错误 `single_flight_busy` 的 HTTP `503` 状态码，同时保持上游 Notion `503` 映射为 `502`；补充 `/api/posts-data`、`/api/post-data`、`/api/post`、`/api/sitemap` 的 HTTP 契约回归。
- 升级 `eslint` 至 `10.15.0`，清零 `minimatch` 传递依赖的 3 个中危 ReDoS 漏洞，`npm audit` 报告 0 个已知漏洞；生产依赖保持零新增、零变动。
- 客户端列表页与早期 `blog-bootstrap.js` 同步服务端最大页码上限（`10000`），超界页码自动归一回第 1 页并清理 URL；无视频 ID 的 YouTube 链接降级为外链卡片；LaTeX 渲染器支持匹配同类嵌套环境并在命令与环境递归间透传深度上限。
- 本地开发服务器补充 `res.headersSent` 流式错误保护并阻止静态访问 `tmp`、`output`、`dist`；`.gitignore` 与 `eslint.config.mjs` 忽略本地 `tmp/` 与 `output/` 目录。

## 验证

- `npm ci` 从 lockfile 干净安装成功（97 packages，0 vulnerabilities）。
- `npm audit` 与 `npm run audit:dependencies` 均报告 0 个已知漏洞。
- Node 24.14.0 的 `npm run verify:release` 通过：ESLint（`10.15.0`，0 warnings）、46 个生产模块架构边界检查、完整 smoke/集成/可靠性回归、31 个公开文件的正式静态构建、依赖审计与 7 个严格视觉场景（`VISUAL_STRICT=1`，未放宽或重录基线）。
- 新增回归覆盖：`single_flight_busy` 全端点 HTTP `503 + Retry-After: 1 + no-store`、超大页码归一化（`page=10001`）、无视频 ID YouTube 嵌入降级、递归无花括号 LaTeX 命令与深层嵌套环境深度封顶、本地开发服务私密目录 `403` 与流式发头后断流容错。
- 当前资源版本：`20261119-v813-925157ac06f5`。

## 阶段提交（可逐阶段精准回退，基线标签 `backup/pre-v8.13`）

| 阶段 | 范围 |
|---|---|
| Phase 0 | `.gitignore` 与 `eslint.config.mjs` 隔离本地 `tmp/` 与 `output/` 目录 |
| Phase 1 | `server/public-content.js` 保留 `single_flight_busy` HTTP `503` 及全端点契约测试 |
| Phase 2 | 升级 `eslint@10.15.0` 清零 `npm audit` 漏洞 |
| Phase 3 | 超大页码归一化、YouTube 嵌入降级、LaTeX 嵌套深度保护、本地开发服务加固及资源指纹同步 |
| Phase 4 | `v8.13.0` 版本元数据、发布文档归档与全量 `verify:release` 验证 |

## 环境边界

本地 Windows、Node 24.14.0、npm 11.9.0。`npm run notion:live-check` 因缺少本地 `.env` 中的 `NOTION_TOKEN` 和 `NOTION_DATABASE_ID` 未执行；推送后将由 GitHub Actions 矩阵补充验证 Node 22.13.0 下界与 Linux Chrome 契约，线上验收仍需配置真实 Notion 凭据联调。
