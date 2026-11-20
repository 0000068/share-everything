# v8.14.1 深度审计细节修复与关键资源体积优化

Updated: 2026-11-20
Target: v8.14.1

- 修复 `js/notion-content.js` 中 `splitLatexRows` / `splitLatexCells` 与 `findMatchingEnvironmentEnd`：按 `{}` 与 `\begin{...}` / `\end{...}` 嵌套深度切分顶层 `\\` 与 `&`，跳过转义字符，正确渲染分块嵌套矩阵、异名嵌套矩阵、`\&` 运算符、`\text{A & B}` 及末尾 `\\\end{...}`。
- `js/notion-api.js` 暴露 `hasCachedPosts(requestUrl)`，`js/blog-bootstrap.js` 在 SPA 返回列表页且命中 20 秒内存缓存时跳过冗余 `/api/posts-data` 请求。
- 加固 `js/blog-bootstrap.js` 封面预热：`existing` 与 `batchSeen` 分离计数，避免已有预热链接引起优先级错位或溢出第 4 张；在 `signal` 中止且未消费时移除 `<link data-blog-cover-preload="true">` 并清理 `PageBootstrap.blogInitialData`。
- 化简 `js/blog-page.js` `describeLoadFailure` 逻辑；`css/blog-page.css` 的 `coverShimmer` 改为 GPU 合成层 `transform: translateX` 且仅对 `.blog-card.visible` 启用动画；清理 `css/style.css` 冗余 `.blog-search input` 移动端规则并合并三组按钮共用样式变量，回收 `blog.html` 关键资源预算余量。

## 验证

- `npm audit` / `npm run audit:dependencies` 均报告 0 个已知漏洞。
- Node 24.14.0 的 `npm run verify:release` 通过：ESLint（0 warnings）、46 模块架构边界检查、256 KiB 关键资源性能契约（`blog.html` 降至 255.03 KiB，余量约 1 KiB）、完整 smoke/数学/集成回归、31 文件白名单静态构建与 7 场景严格视觉回归（`VISUAL_STRICT=1`，基线零漂移、未放宽）。
- 当前资源版本：`20261120-v814-30429e72ae45`。
