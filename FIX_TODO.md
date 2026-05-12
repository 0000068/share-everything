# 移动端重设计与待修复清单

> 更新时间：2026-05-12
> 目标：PC 视觉和粒子保持现状；移动端重新做成轻量、清爽、稳定的体验。

## 执行原则

- PC 默认样式和粒子效果冻结，不主动改动。
- 移动端改动必须限定在真移动设备 gate：`(max-width: 768px) and (hover: none) and (pointer: coarse)`，或 JS 中等价的移动端判断。
- 移动端采用方案 C：`首页极轻粒子`，`博客列表页禁用粒子`，`文章页禁用粒子`。
- 博客列表保留双列正方形卡片，但重做内部排版和性能负担。
- 文章页移动端优先阅读体验：去掉 dock 栏，移动端收藏入口可以移除。
- 不直接把手机端整页强制缩成 PC 版；目标是继承 PC 的连续背景质感，但保留手机端可读字号、触控间距和双列方卡布局。

## 截图复核结论

- 图 1 属实：文章页移动端 dock 栏覆盖正文底部，并且玻璃浮层会放大背景断层感。文章页移动端应完全去掉 dock，正文底部不再为 dock 预留大块空白。
- 图 2 属实：文章页在移动浏览器缩放/地址栏变化时出现明显矩形背景分区。优先改成移动端文章/列表页统一的静态全页背景基底，避免固定 `100vh` canvas、fixed 背景层、局部内容背景互相错位。
- 图 3/4 可作为移动端视觉方向参考：背景应该像 PC 一样连续、完整、沉浸，但不建议真正用 viewport/meta 缩放把整页压成桌面版，否则文章阅读字号和触控面积会变差。
- 封面首屏笔记本 emoji 割裂属实：图片未加载、懒加载或加载失败时，不应闪出 `📝` 这种强风格 emoji，应换成低对比渐变、骨架屏或纯色占位。
- Brave/vivo 修复后仍复现属实：根因不是文章数据，而是未带版本指纹的 `/css/*`、`/js/*` 会被移动浏览器继续复用旧缓存；同时部分 Android 浏览器对 `(hover: none) and (pointer: coarse)` 的结果不稳定，导致移动端隐藏 dock、长 URL 限宽等新规则没有稳定命中。

## P1 移动端重设计优先项

- [x] 实现移动端粒子策略：首页极轻粒子，博客列表页和文章页禁用粒子。
  - 影响：移动端性能、滚动稳定性、电量消耗。
  - 相关文件：`js/common.js`、`css/style.css`

- [x] 修复手机缩放时背景割裂的问题。
  - 影响：移动端缩放、地址栏收起/展开、视口高度变化时的背景连续性。
  - 当前现象：文章页缩放或滚动时会出现上下/矩形色块分区；底部 dock 也会让正文底部看起来被切断。
  - 设计方向：移动端文章页、博客列表页禁用粒子后，使用同一套全页背景基底承接 PC 质感；不要让 `canvas`、`.ambient-background`、正文容器背景各画各的。
  - 检查方向：`100vh`/`100svh`/`100dvh`、固定背景层、canvas 尺寸、ambient background 高度、页面切换后的重绘、post/list 页面局部背景色。
  - 验收标准：`360x740`、`390x844`、`430x932`，正常缩放和浏览器最小比例缩放下，文章页从顶部滚到底部都没有明显横向断层或矩形色块。
  - 相关文件：`css/style.css`、`js/common.js`

- [x] 修复封面/首屏笔记本图标割裂的问题。
  - 影响：移动端首屏质感和封面视觉统一性。
  - 当前现象：封面图首次未加载好时，卡片/封面区域会露出笔记本 emoji，占位风格和整体视觉割裂。
  - 设计方向：移动端移除 `📝` emoji fallback，改为低对比渐变、骨架屏、柔和噪点或纯色占位；图片加载失败也保持安静，不出现突兀图标。
  - 验收标准：首屏加载、慢网懒加载、封面加载失败三种状态下，博客双列方卡仍保持方形，且不出现笔记本 emoji 闪烁。
  - 检查方向：图标尺寸、emoji/图标 fallback、cover placeholder 裁切、首屏层级和背景衔接。
  - 相关文件：`css/style.css`、`css/blog-page.css`、`js/blog-page.js`、`js/bookmark.js`、`js/notion-api.js`、`js/notion-content.js`

- [x] 修复手机首页 `hero-title` 强制不换行导致的窄屏溢出风险。
  - 影响：移动端首页首屏。
  - 相关文件：`css/style.css`

- [x] 修复 Brave/vivo 继续显示旧 UI 的缓存与移动端 gate 兼容问题。
  - 当前现象：Chrome/Safari 已正常，但 Brave/vivo 仍显示文章页顶部 dock、按钮文字被挤成竖排、长 URL 横向撑出正文。
  - 根因：HTML 会重新验证，但 CSS/JS 是未指纹路径并带有 `stale-while-revalidate` 缓存；旧移动浏览器可能继续使用旧 `style.css`/`post-page.css`。另一个触发点是部分 Android 浏览器对 `hover/pointer` 媒体查询返回不一致。
  - 修复方向：静态 CSS/JS 链接加 `?v=20260512-mobile-compat` 版本指纹；`site-utils.js` 在触屏窄视口下同步 `html.is-mobile-device-viewport`，CSS 和 JS 以这个 class 作为等价移动端 fallback。
  - 相关文件：`index.html`、`blog.html`、`post.html`、`css/style.css`、`css/blog-page.css`、`css/post-page.css`、`js/site-utils.js`、`js/blog-page.js`、`js/post-page.js`

- [x] 修复 Codex/Windows 启动本地服务时 `cmd /c start /b ... > log` 卡死的问题。
  - 当前现象：服务实际已启动，但外层 `cmd` 继承常驻进程的 stdout/stderr 句柄，导致工具调用一直不返回。
  - 修复方向：新增 `scripts/start-dev-bg.mjs` 和 `scripts/stop-dev-bg.mjs`，通过 Node `spawn(..., { detached: true })` + `child.unref()` 真正后台启动；`AGENTS.md` 记录以后必须用 `npm run dev:bg`。
  - 相关文件：`scripts/start-dev-bg.mjs`、`scripts/stop-dev-bg.mjs`、`package.json`、`AGENTS.md`、`.gitignore`

- [ ] 保留博客列表双列正方形卡片，但重做移动端卡片内部排版。
  - 目标：双列方卡继续好看，同时标题、分类、封面、收藏按钮不拥挤。
  - 设计方向：参考图 4 的双列密度，保留方卡和封面视觉；内部信息减少玻璃层、减少强阴影，确保 360px 宽度下两列仍稳定。
  - 相关文件：`css/blog-page.css`

- [ ] 降低移动端博客列表的玻璃拟态、模糊和重阴影强度。
  - 影响：移动端性能和滚动顺滑度。
  - 相关文件：`css/blog-page.css`、`css/style.css`

- [x] 移动端文章页去掉 dock 栏。
  - 目标：文章页保持清爽阅读，不再显示底部/顶部复杂浮层 dock。
  - 当前现象：图 1/2 中 dock 悬浮在正文底部，覆盖阅读区域并制造额外背景层。
  - 验收标准：移动端文章页不显示 `.top-actions` dock，正文底部不被遮挡；PC 端导航保持不变。
  - 相关文件：`css/style.css`、`post.html`

- [x] 移动端文章页隐藏收藏入口。
  - 目标：移动端文章内可以不要收藏按钮，减少浮层和状态复杂度。
  - PC：保留现有浮动收藏按钮。
  - 相关文件：`js/post-page.js`、`css/post-page.css`

- [x] 修复移动端文章长 URL 撑宽导致的正文宽窄不一致和 Brave/vivo 错位。
  - 当前现象：文章开头的知乎长链接会把布局撑出视口，导致前几行特别宽、后文变窄，部分移动浏览器出现右侧背景断层和 UI 错移。
  - 修复方向：正文、链接、列表项强制长词断行；文章容器和移动端 wrapper 限制在 `100%` 宽度内，禁止横向布局外溢。
  - 相关文件：`css/post-page.css`、`css/style.css`

- [ ] 保留文章页移动端“返回列表”入口，并优化为清爽阅读按钮。
  - 影响：移动端文章页基本导航。
  - 相关文件：`post.html`、`css/post-page.css`、`js/post-page.js`

- [x] 将 `blog.html` 搜索框从 `type="text"` 改为 `type="search"`。
  - 影响：手机搜索键盘和清除按钮体验。
  - 相关文件：`blog.html`

## P2 功能一致性与维护项

- [ ] 修复 SPA 跳转文章页时 JSON-LD 可能无法重新生成的问题。
  - 影响：文章页结构化数据 SEO；不影响正常阅读。
  - 相关文件：`js/runtime-core.js`、`js/spa-router.js`、`js/post-page.js`

- [ ] 收敛手机端 `.top-actions` 的分散覆盖规则。
  - 新目标：blog 可保留轻量导航；post 移动端不显示 dock。
  - 相关文件：`css/style.css`

- [x] 统一 `SITE_ARCHITECTURE.md`、`README.md`、`package.json` 的版本描述。
  - 影响：读者理解、发布规则一致性。
  - 当前状态：已按最新发布顺序推进到 `v3.5`；`package.json` 和 README 使用 `3.5.0`，`SITE_ARCHITECTURE.md` 使用 `v3.5`；当前仓库根目录未发现 `git-rules.md`。
  - 相关文件：`SITE_ARCHITECTURE.md`、`README.md`、`package.json`、`scripts/smoke-check.mjs`

- [ ] 让本地 dev server 挂载 `/api/notion` 并返回与生产一致的 `410`。
  - 影响：本地调试和文档一致性。
  - 相关文件：`scripts/local-server.mjs`、`api/notion.js`

- [ ] 改进 `local-server.mjs` 异常处理，避免所有异常都变成 `404`。
  - 影响：本地 API 调试效率。
  - 相关文件：`scripts/local-server.mjs`

- [ ] 统一 `api/post.js` 模板插入 helper 的命中检测与告警机制。
  - 影响：SSR 模板替换可靠性和日志可观测性。
  - 相关文件：`api/post.js`

- [ ] 处理静态 HTML 与 `robots.txt` 中硬编码的 `https://www.0000068.xyz`。
  - 影响：换域名部署时 canonical、OG、robots sitemap 正确性。
  - 相关文件：`index.html`、`blog.html`、`post.html`、`robots.txt`

- [ ] 明确或强化 Notion 整库公开策略的风险提示。
  - 影响：避免草稿误放入公开数据库。
  - 相关文件：`server/notion-server.js`、`README.md`、`SITE_ARCHITECTURE.md`

- [ ] 补充真实浏览器/手机视觉回归检查。
  - 建议视口：`360x740`、`390x844`、`430x932`、`768x1024`、桌面宽屏。
  - 覆盖：移动首页、移动博客列表双列方卡、移动文章页无 dock、PC 首页粒子不变。
  - 相关文件：`scripts/smoke-check.mjs` 或新增视觉检查脚本。

## P3 性能、文档与整洁项

- [ ] 将 `spa-router.js` 的 `script.onerror = reject` 改为抛出清晰 `Error`。
  - 影响：SPA 脚本加载失败时的排障质量。
  - 相关文件：`js/spa-router.js`

- [ ] 在服务端 `mapNotionPage` 时预计算 `_searchText`。
  - 影响：降低首次搜索的重复计算成本。
  - 相关文件：`server/notion-server.js`、`js/notion-content.js`

- [ ] 优化 Notion 富文本链接策略，站内链接不强制新标签打开。
  - 影响：站内文章互链体验。
  - 相关文件：`js/notion-content.js`

- [ ] 在安全文档中说明 embed iframe sandbox 放宽是刻意权衡。
  - 影响：避免后续误删或误判安全风险。
  - 相关文件：`SITE_ARCHITECTURE.md`

- [ ] 修正 README 中“WebGL 粒子”的描述，当前实现是 Canvas 2D。
  - 影响：文档准确性。
  - 相关文件：`README.md`、`js/common.js`

- [ ] 修正 README 中“3 级响应式断点”的描述。
  - 影响：文档准确性；当前主要是真移动端 gate。
  - 相关文件：`README.md`、`css/style.css`、`css/blog-page.css`、`css/post-page.css`

- [ ] 修正 README 中“3000+ 断言”的描述。
  - 影响：文档准确性；更准确是 3000+ 行测试，断言/expect 约 540 个。
  - 相关文件：`README.md`、`scripts/smoke-check.mjs`

- [ ] 将 README 本地命令从 `npm run` 调整为更适合 PowerShell 的 `npm.cmd run`。
  - 影响：Windows 本地开发体验。
  - 相关文件：`README.md`

- [ ] 为 `getSiteOrigin()` 增加 `SITE_URL` 格式校验或 fallback。
  - 影响：避免错误配置生成坏 canonical/sitemap。
  - 相关文件：`server/notion-server.js`

- [ ] 清理 SPA 焦点管理留下的 `tabindex="-1"`。
  - 影响：DOM/可访问性整洁度。
  - 相关文件：`js/runtime-core.js`

- [ ] 为 `api/post.js` JSON-LD 替换 regex 的 key 做 regex escape。
  - 影响：未来扩展稳健性；当前常量安全。
  - 相关文件：`api/post.js`

- [ ] 删除根目录空的 `.codex-local-*.log`。
  - 当前现象：存在 `.codex-local-server.err.log`、`.codex-local-server.out.log`、`.codex-local-verify.err.log`、`.codex-local-verify.out.log`。
  - 影响：仓库整洁度；文件已被 gitignore，不会提交。

- [ ] 将 `post.html` 中 `#postEmpty` 链接的内联样式迁移到 class。
  - 影响：样式集中化和后续换色维护。
  - 相关文件：`post.html`、`css/post-page.css`
