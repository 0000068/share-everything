# 移动端重设计与待修复清单

> 更新时间：2026-05-13
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
  - 2026-05-13 复查：手机首页改为 PC 同款粒子模型的轻量动态版，移动端使用 120 粒子并限制约 30fps；桌面仍保留 350 粒子的动态效果。
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

- [x] 修复手机首页 `Share Everything` 标题排版。
  - 影响：移动端首页首屏。
  - 2026-05-13 复查：标题保持同一行，并在移动端改回 PC 同款 `title-gradient` 渐变动画；仅保留移动端字号和纵向位置控制。
  - 相关文件：`css/style.css`

- [x] 修复 Brave/vivo 继续显示旧 UI 的缓存与移动端 gate 兼容问题。
  - 当前现象：Chrome/Safari 已正常，但 Brave/vivo 仍显示文章页顶部 dock、按钮文字被挤成竖排、长 URL 横向撑出正文。
  - 根因：HTML 会重新验证，但 CSS/JS 是未指纹路径并带有 `stale-while-revalidate` 缓存；旧移动浏览器可能继续使用旧 `style.css`/`post-page.css`。另一个触发点是部分 Android 浏览器对 `hover/pointer` 媒体查询返回不一致。
  - 修复方向：静态 CSS/JS 链接加版本指纹；`site-utils.js` 在触屏窄视口下同步 `html.is-mobile-device-viewport`，CSS 和 JS 以这个 class 作为等价移动端 fallback。
  - 相关文件：`index.html`、`blog.html`、`post.html`、`css/style.css`、`css/blog-page.css`、`css/post-page.css`、`js/site-utils.js`、`js/blog-page.js`、`js/post-page.js`

- [x] 修复 Codex/Windows 启动本地服务时 `cmd /c start /b ... > log` 卡死的问题。
  - 当前现象：服务实际已启动，但外层 `cmd` 继承常驻进程的 stdout/stderr 句柄，导致工具调用一直不返回。
  - 2026-05-12 复查：按最新取舍，不保留此前的 `dev:bg`/`stop:bg` 脚本方案；README、架构文档和 smoke check 已回到当前实际存在的 `npm.cmd run dev`。
  - 相关文件：`package.json`、`README.md`、`SITE_ARCHITECTURE.md`、`scripts/smoke-check.mjs`

- [x] 保留博客列表双列正方形卡片，但重做移动端卡片内部排版。
  - 目标：双列方卡继续好看，同时标题、分类、封面、收藏按钮不拥挤。
  - 设计方向：参考图 4 的双列密度，保留方卡和封面视觉；内部信息减少玻璃层、减少强阴影，确保 360px 宽度下两列仍稳定。
  - 2026-05-12 复查：移动端分类小标签恢复 `max-width: 100%`、单行省略和固定行高，避免小标签撑出或挤坏卡片内部布局。
  - 相关文件：`css/blog-page.css`

- [x] 降低移动端博客列表的玻璃拟态、模糊和重阴影强度。
  - 影响：移动端性能和滚动顺滑度。
  - 2026-05-12 复查：移动端列表卡片继续禁用 backdrop blur，新增 `content-visibility: auto` 与 `contain-intrinsic-size`，并在移动端跳过首轮卡片 reveal 动画；PC 卡片 hover、PC UI 和桌面粒子不受影响。
  - 相关文件：`css/blog-page.css`、`js/blog-page.js`

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

- [x] 保留文章页移动端“返回列表”入口，并优化为清爽阅读按钮。
  - 影响：移动端文章页基本导航。
  - 2026-05-12 复查：移动端返回按钮改成轻量 pill 样式，补充 `aria-label`，并把 `#postEmpty` 放回文章容器内，避免本地错误空态被整屏容器挤到首屏下方。
  - 相关文件：`post.html`、`css/post-page.css`、`js/post-page.js`

- [x] 修复移动端文章页元信息标签显示拥挤的问题。
  - 影响：文章页标题下方的小标签/标签列表在窄屏下的可读性。
  - 修复方向：文章标签保留 PC 文本形态；仅在真移动端和 `html.is-mobile-device-viewport` fallback 下渲染为可换行小 chip，避免撑宽或互相挤压。
  - 相关文件：`js/notion-content.js`、`css/post-page.css`

- [x] 将 `blog.html` 搜索框从 `type="text"` 改为 `type="search"`。
  - 影响：手机搜索键盘和清除按钮体验。
  - 相关文件：`blog.html`

## P2 功能一致性与维护项

- [x] 修复 SPA 跳转文章页时 JSON-LD 可能无法重新生成的问题。
  - 影响：文章页结构化数据 SEO；不影响正常阅读。
  - 2026-05-12 复查：`runtime-core.js` 在无 nonce 的静态页也会创建 JSON-LD 节点；有 nonce 时继续保留 nonce。SPA 换页仍会从 SSR 文档同步结构化数据。
  - 相关文件：`js/runtime-core.js`、`js/spa-router.js`、`js/post-page.js`

- [x] 收敛手机端 `.top-actions` 的分散覆盖规则。
  - 新目标：blog 可保留轻量导航；post 移动端不显示 dock。
  - 2026-05-12 复查：共享移动端 dock 规则改为只作用于 blog；post 只保留隐藏 dock 的明确规则和 `html.is-mobile-device-viewport` fallback。
  - 相关文件：`css/style.css`

- [x] 统一 `SITE_ARCHITECTURE.md`、`README.md`、`package.json` 的版本描述。
  - 影响：读者理解、发布规则一致性。
  - 当前状态：已按下一版本意向推进到 `v4.0`；`package.json` 和 README 使用 `4.0.0`，`SITE_ARCHITECTURE.md` 使用 `v4.0`，并由 `scripts/smoke-check.mjs` 校验。
  - 相关文件：`SITE_ARCHITECTURE.md`、`README.md`、`package.json`、`scripts/smoke-check.mjs`

- [x] 让本地 dev server 挂载 `/api/notion` 并返回与生产一致的 `410`。
  - 影响：本地调试和文档一致性。
  - 2026-05-12 复查：`scripts/local-server.mjs` 已挂载 `/api/notion`，`api/notion.js` 固定返回 `410` 与 `no-store`。
  - 相关文件：`scripts/local-server.mjs`、`api/notion.js`

- [x] 改进 `local-server.mjs` 异常处理，避免所有异常都变成 `404`。
  - 影响：本地 API 调试效率。
  - 2026-05-12 复查：已有 `createHttpError()`、`getErrorStatusCode()` 和缺失静态文件识别，非 404 错误会按状态码返回并记录 500 级错误。
  - 相关文件：`scripts/local-server.mjs`

- [x] 统一 `api/post.js` 模板插入 helper 的命中检测与告警机制。
  - 影响：SSR 模板替换可靠性和日志可观测性。
  - 2026-05-12 复查：`insertMarkupBefore()` 改为显式 `didMatch`，避免“替换内容刚好等于原 HTML”时误判未命中。
  - 相关文件：`api/post.js`

- [x] 处理静态 HTML 与 `robots.txt` 中硬编码的 `https://www.0000068.xyz`。
  - 影响：换域名部署时 canonical、OG、robots sitemap 正确性。
  - 2026-05-12 复查：`index.html`、`blog.html`、`post.html` 的 fallback OG/canonical 与 `robots.txt` 仍是生产域名；客户端 `seo-meta.js` 会在浏览器运行后按当前 origin 修正页面 meta，但不执行 JS 的爬虫仍会读到静态硬编码。建议后续用构建期替换或动态 robots/sitemap 入口统一处理。
  - 2026-05-12 本轮补充：暂不直接改掉正式 SEO 域名，已在 `scripts/smoke-check.mjs` 增加“受控硬编码”白名单检查，防止 `0000068.xyz` 扩散到未登记文件；真正换域名方案仍保留到下一轮设计。
  - 2026-05-13 v4.0 处理：新增 `site.config.json` 作为生产域名的受控配置源；`server/notion-server.js` 改为读取该配置作为 `SITE_URL` fallback；`robots.txt` 静态文件已删除，改由 `/api/robots` 动态输出，并在 Vercel 与本地开发服务器中映射；smoke check 会校验静态 HTML fallback canonical/OG 与 `site.config.json` 同步、动态 robots sitemap URL 正确、服务端代码不再重复硬编码生产域名。
  - 剩余边界：静态 HTML 仍保留 SEO fallback 绝对 URL，但已被 `site.config.json` 和 smoke check 约束；若后续换域名，改配置和 HTML fallback 即可被检查发现是否漏同步。
  - 相关文件：`index.html`、`blog.html`、`post.html`、`site.config.json`、`api/robots.js`、`server/notion-server.js`、`vercel.json`、`scripts/local-server.mjs`、`scripts/smoke-check.mjs`

- [x] 明确或强化 Notion 整库公开策略的风险提示。
  - 影响：避免草稿误放入公开数据库。
  - 2026-05-12 复查：README 已明确当前默认读取整个 `NOTION_DATABASE_ID` 指向的数据库，并提醒草稿放入单独数据库；架构文档也记录了该公开策略。
  - 相关文件：`server/notion-server.js`、`README.md`、`SITE_ARCHITECTURE.md`

- [x] 补充真实浏览器/手机视觉回归检查。
  - 建议视口：`360x740`、`390x844`、`430x932`、`768x1024`、桌面宽屏。
  - 覆盖：移动首页、移动博客列表双列方卡、移动文章页无 dock、PC 首页粒子不变。
  - 2026-05-12 已做：内置浏览器复核 `390x844` 首页标题单行、博客移动端无粒子且筛选小标签正常、文章移动端无 dock/空态首屏显示、桌面首页粒子正常；仍建议后续补自动截图回归。
  - 2026-05-12 本轮补充：再次用内置浏览器复核 `390x844` 首页、博客页和文章空态，并用 `1280x720` 首页双截图差异确认 PC 粒子仍动态；当前仍缺可重复运行的自动截图脚本。
  - 2026-05-13 继续优化：新增 `scripts/smoke-check/mobile-layout.mjs`，把移动端首页标题渐变、单行标题、博客卡片小标签高度、标题/收藏同排等关键规则纳入 `npm.cmd run check`；这能防止本次 UI 回归再次静默出现，但仍不等同于真实截图 diff。
  - 2026-05-13 本轮补充：按最新参考图继续微调移动端首页，标题略收宽并整体下移；博客卡片收藏按钮回到 26px 小尺寸，避免右侧按钮显得过重。
  - 2026-05-13 目标修正：移动端首页改为 PC 同款标题渐变动画与 PC 同款粒子模型的轻量动态版；博客/文章移动端继续禁用粒子。
  - 2026-05-13 v4.0 完成：新增 `scripts/visual-regression.mjs` 与 `npm.cmd run visual:check`，脚本会启动本地服务、拉起本机 Chrome/Edge headless、截图移动首页/移动总览/移动文章空态/桌面首页，并断言移动标题渐变和单行、手机首页粒子动态、博客卡片 26px 收藏按钮、文章页移动 dock 隐藏、PC 粒子仍动态。
  - 相关文件：`scripts/visual-regression.mjs`、`scripts/local-server.mjs`、`scripts/smoke-check.mjs`、`scripts/smoke-check/mobile-layout.mjs`、`package.json`

## P3 性能、文档与整洁项

- [x] 将 `spa-router.js` 的 `script.onerror = reject` 改为抛出清晰 `Error`。
  - 影响：SPA 脚本加载失败时的排障质量。
  - 2026-05-12 复查：脚本加载失败时会 reject 一个带 `url` 的 `Error`，便于定位具体失败资源。
  - 相关文件：`js/spa-router.js`

- [x] 在服务端 `mapNotionPage` 时预计算 `_searchText`。
  - 影响：降低首次搜索的重复计算成本。
  - 2026-05-12 复查：服务端列表查询和单篇摘要映射都传入 `includeSearchText: true`，客户端搜索可优先复用 `_searchText`。
  - 相关文件：`server/notion-server.js`、`js/notion-content.js`

- [x] 优化 Notion 富文本链接策略，站内链接不强制新标签打开。
  - 影响：站内文章互链体验。
  - 2026-05-12 复查：`shouldOpenLinkInNewTab()` 已按站点 origin 区分站内/站外链接，站内富文本链接不再强制 `target="_blank"`。
  - 相关文件：`js/notion-content.js`

- [x] 在安全文档中说明 embed iframe sandbox 放宽是刻意权衡。
  - 影响：避免后续误删或误判安全风险。
  - 2026-05-12 复查：`SITE_ARCHITECTURE.md` 已说明 embed iframe sandbox 的放宽范围和权衡原因。
  - 相关文件：`SITE_ARCHITECTURE.md`

- [x] 修正 README 中“WebGL 粒子”的描述，当前实现是 Canvas 2D。
  - 影响：文档准确性。
  - 2026-05-12 复查：README 已统一为 Canvas 2D 粒子描述。
  - 相关文件：`README.md`、`js/common.js`

- [x] 修正 README 中“3 级响应式断点”的描述。
  - 影响：文档准确性；当前主要是真移动端 gate。
  - 2026-05-12 复查：README 已描述为真实移动端 gate，窄屏桌面保持桌面体验。
  - 相关文件：`README.md`、`css/style.css`、`css/blog-page.css`、`css/post-page.css`

- [x] 修正 README 中“3000+ 断言”的描述。
  - 影响：文档准确性；更准确是 3000+ 行测试，断言/expect 约 540 个。
  - 2026-05-12 复查：README 已改为“3000+ 行测试 / 约 540 个断言”。
  - 相关文件：`README.md`、`scripts/smoke-check.mjs`

- [x] 将 README 本地命令从 `npm run` 调整为更适合 PowerShell 的 `npm.cmd run`。
  - 影响：Windows 本地开发体验。
  - 2026-05-12 复查：README 和架构文档的本地命令已使用 `npm.cmd run`。
  - 相关文件：`README.md`

- [x] 为 `getSiteOrigin()` 增加 `SITE_URL` 格式校验或 fallback。
  - 影响：避免错误配置生成坏 canonical/sitemap。
  - 2026-05-12 复查：`normalizeSiteOrigin()` 已校验 http/https、清理凭据/查询/hash，并在非法配置时回退到默认站点。
  - 相关文件：`server/notion-server.js`

- [x] 清理 SPA 焦点管理留下的 `tabindex="-1"`。
  - 影响：DOM/可访问性整洁度。
  - 2026-05-12 复查：临时焦点目标只在无自然焦点能力时添加 `tabindex="-1"`，随后由 `cleanupTemporaryFocus()` 移除，并用 `data-spa-managed-focus` 限定清理范围。
  - 相关文件：`js/runtime-core.js`

- [x] 为 `api/post.js` JSON-LD 替换 regex 的 key 做 regex escape。
  - 影响：未来扩展稳健性；当前常量安全。
  - 2026-05-12 复查：`upsertStructuredDataScript()` 已通过 `escapeRegex(marker)` 构造现有 JSON-LD script 的替换表达式。
  - 相关文件：`api/post.js`

- [x] 删除根目录空的 `.codex-local-*.log` 和 `.local-server.*.log`。
  - 影响：仓库整洁度；文件已被 gitignore，不会提交。
  - 2026-05-12 复查：已删除 6 个本地日志空壳；删除 `.local-server.*.log` 前停止了占用 `127.0.0.1:4173` 的本地预览进程。

- [x] 删除空的 VS Code 本地配置并忽略编辑器目录。
  - 影响：仓库结构整洁度。
  - 2026-05-12 复查：删除只包含 `{}` 的 `.vscode/settings.json`，移除空 `.vscode/` 目录，并在 `.gitignore` 中加入 `.vscode/`；`scripts/smoke-check.mjs` 已补充断言。
  - 2026-05-12 本轮补充：根目录未发现 `.local-server.pid`，已在 `.gitignore` 补充该文件名，并确认 `node_modules/`、`.vscode/`、`*.log`、`.DS_Store`、`Thumbs.db` 均被覆盖。
  - 相关文件：`.vscode/settings.json`、`.gitignore`、`scripts/smoke-check.mjs`

- [x] 补充无扩展名 dotfile 的 LF 归一化规则。
  - 影响：跨 Windows/Mac 协作时减少换行噪声。
  - 2026-05-12 复查：`.gitattributes` 已覆盖 `.editorconfig`、`.env.example`、`.gitignore`，并归一化 `.gitignore` / `.gitattributes` 当前工作区换行。
  - 相关文件：`.gitattributes`、`.gitignore`

- [x] 删除本机残留 `node_modules/`。
  - 影响：本地目录体积与迁移整洁度。
  - 2026-05-12 复查：`package.json` 当前没有依赖项，仓库代码未引用 `node_modules` 中的 `katex`/`commander`；`node_modules/` 约 4 MB，已被 `.gitignore` 忽略。
  - 2026-05-12 本轮完成：确认路径位于 `C:\Users\x\Documents\anti1\node_modules` 后删除；最终 `git status --short --ignored` 不再显示 `!! node_modules/`。
  - 相关文件：`node_modules/`、`package.json`、`.gitignore`

- [x] 为静态资源版本指纹增加一致性护栏。
  - 影响：后续发布时减少漏改 `?v=...` 的维护风险。
  - 2026-05-12 复查：`index.html`、`blog.html`、`post.html` 与 `scripts/smoke-check.mjs` 都使用同一套静态资源版本指纹；当前可用，但后续换版本需要多处同步。
  - 2026-05-12 本轮完成：`scripts/smoke-check.mjs` 已把当前版本收敛为 `assetVersionValue`，并扫描三个 HTML 的 `/css`、`/js` 资源，要求所有静态资源只使用同一个 `?v=` 值；若出现多套版本或漏同步，检查会失败。后续如需彻底免手改，可再引入构建期替换。
  - 2026-05-13 本轮补充：移动端 UI 修复后，静态资源版本指纹推进到 `v=20260513-mobile-pc-hero`，确保移动浏览器不会继续复用旧 CSS。
  - 相关文件：`index.html`、`blog.html`、`post.html`、`scripts/smoke-check.mjs`

- [x] 将 `post.html` 中 `#postEmpty` 链接的内联样式迁移到 class。
  - 影响：样式集中化和后续换色维护。
  - 2026-05-12 复查：`#postEmpty` 链接已使用 `.empty-state-helper` / `.empty-state-link`，不再有链接内联样式。
  - 相关文件：`post.html`、`css/post-page.css`
