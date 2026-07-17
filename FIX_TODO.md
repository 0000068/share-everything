# 修复清单

> 更新时间：2026-07-18（v8.6 性能、取消链路与发布门禁加固）

---

## 一、当前待修任务

> v8.6 发布提交已同步到 `origin/main`。提交后的 Linux Chrome 门禁暴露了 headless runner 不保证存在物理 fine pointer、而真实桌面又可能带触摸屏的平台差异；当前收尾把真实浏览器职责收敛为“桌面 device metrics + UA 形态 + 实际几何”，fine-pointer 分类继续由确定性 SiteUtils smoke 覆盖，并把共享 runner 的 Chrome 冷启动等待限定为 30 秒。部署仍是独立动作，最终同步状态以 Git 与 GitHub Actions 为准。

---

## 二、需评估再启动的架构性 backlog

| ID | 简述 | 触发条件 |
|---|---|---|
| `B-2` | **菜单 active 状态 i18n-safe 校验**。`js/blog-page.js` 的 `updatePageUI()` 使用 `button.dataset.nav === "bookmarks"` / `"overview"` 区分激活按钮（之前是中文文本匹配，已重构）。当前 data 值是英文 key，i18n 安全。**触发再审**：站点引入运行时多语言切换时确认 data-nav 仍是 stable key。 |
| `B-4` | **v8.0 之前的 Vercel deployment Redeploy 失败**。旧 deployment 记录里的 Git source 还指向 `aihkibq-ux/Share-everything`（已 404）。Vercel 的 Instant Rollback / Redeploy 对 v7.x 系列会报 "The provided GitHub repository can't be found"。**触发再审**：当 v8.x 出现需要回滚到 v7.x 行为的回归时；目前唯一通路是本地 `git checkout v7.x` 然后强制 push 到 main，让 webhook 触发一次新 deployment。日常无影响。 |

---

## 三、历史完成记录

### v8.6 性能、取消链路与发布门禁加固（待发布，2026-07-18）

- 移除外部 Google Fonts 与退役的 `font-loader.js`，改用本地系统字体栈；博客列表请求由无依赖 bootstrap 提前启动，HTML 对 blog/post 渲染链提供页面专属 modulepreload。
- 静态 JS/CSS/assets 改用一年 immutable 缓存；`ASSET_VERSION` 加入基于实际发布内容的确定性 12 位指纹，内容变化但缓存键未更新时 smoke 必须失败。
- SPA 导航拆分网络与页面准备 deadline：网络失败事务性保留旧 DOM/URL/SEO 并显示可访问重试；runtime 版本缺失/不一致、文档结构或 loader/init 准备失败只触发一次真实导航，避免跨部署资源混用。目标页面同版本 modulepreload 在 loader 前迁移；预取严格比较 URL origin、跳过当前页面，并将 `{ url, signal }` 传给页面加载器。
- 浏览器列表/文章请求、服务端 Notion 操作与图片代理统一贯穿取消和总预算；公开文章成功响应启用短边缘缓存，失败仍为 `no-store`。
- 移动兼容 CSS 与 modulepreload 生成区改用显式起止 marker，避免生成器误删区外手写内容；架构检查识别 `import(versioned(...))` 动态边。
- smoke 增加 dotenv 尾注、共享请求引用计数取消、bootstrap 首次消费、本地服务器真实 HTTP、性能与 PWA 图标尺寸契约；视觉 fixture 覆盖真实博客卡片和完整文章的移动/桌面布局，并以有界语义就绪、卡片 reveal 完成状态和有限 CSS 动画/过渡收敛取代固定截图等待；严格模式下收敛超时会失败。
- 浏览器列表/详情与早期 blog bootstrap 的总预算统一为 `35000ms`，明确高于服务端完整 Notion 操作默认 `30000ms`；避免合法的冷分页/递归读取在 15 秒处被客户端反复取消，且 smoke 锁定两端预算关系。
- 博客依赖链移除正文渲染器；规范化文章 ID 贯穿路由、数据 URL、pending/session 缓存与书签；封面 URL 固定显式 `format→src→sig→w`，不再读取 `Accept` 或发送 `Vary: Accept`。
- 书签签名元数据按 30 分钟独立刷新，失败/部分成功采用 5–60 秒有界退避、联网立即重试；跨标签页合并以较新的 `metadataRefreshedAt` 为准，旧响应不能覆盖新状态。
- single-flight 仅在最后一个订阅者离开后取消，放弃请求的晚到结果不能覆盖新缓存/cooldown；同分类不同搜索复用分类基础页，未知分类在 Notion 查询前返回空集。
- sitemap 复用统一请求生命周期；本地只读 API 保留 raw URL/断开事件，非 GET/HEAD 请求体仅流式 drain，不在方法拒绝前聚合到内存。
- 粒子系统按宽度、省流量、reduced-motion、硬件与实测帧成本在关闭或 350/220/120 档间有界调整；视觉基线的 7 个场景共享单一清单，截图先验证动态效果再固定测试随机源和无限 CSS 动画相位，三样本最大两两差异超过 0.25% 即拒绝安装，并以 staging/backup/install/rollback 事务替换。
- Linux Chrome 浏览器门禁不再假设无物理输入设备的 headless runner 能稳定报告 fine pointer，也不把桌面设备误定义为零触点：真实浏览器覆盖 320px 桌面 device metrics、UA 与几何，SiteUtils smoke 独立覆盖 fine-pointer + legacy `ontouchstart` 分类，真实移动场景覆盖 coarse-pointer 分支；Chrome 冷启动等待使用 30 秒有界上限。
- 本轮仅改变公开内容的传输、缓存与质量边界；专用 Notion 数据库仍按既定产品设计整体公开。

### v8.5 图片代理与质量门禁加固（2026-07-10）

从生产边界重新审查远程图片链路，并把静态质量、模块边界和真实浏览器行为升级为可执行门禁。整个 Notion 数据库继续按产品设计公开；本轮限制的是图片代理能力，而不是内容公开范围。

**生产安全与正确性**

- `server/image-source-policy.js` 为服务端发布的封面和正文图片源生成 HMAC 签名；`/api/image`、`/api/cover` 只接受签名正确、字段唯一且没有额外 query 的请求，避免公开端点演变为匿名通用代理。
- `server/image-format.js` 依据真实文件签名识别 PNG、JPEG、GIF、WebP、AVIF/HEIF、BMP、TIFF、ICO；上游仅伪造 `Content-Type` 无法再得到可缓存的图片响应。
- 图片成功头延迟到验证/转换完成后写入；所有失败响应统一为 `application/json; charset=utf-8 + no-store`，并清除残留的实体头和 `Vary`，修复错误 JSON 被标记成图片的真实线上缺陷。
- `server/request-guard.js` 对原图代理与 Sharp 转换分别施加有界的每客户端固定窗口限流和单实例并发闸门，超限返回 `429` 或 `503`，避免未命中 CDN 时耗尽连接、内存或 CPU。
- `/api/cover` 在 v8.5 的历史实现中曾按 `Accept` 相对质量协商 AVIF/WebP/JPEG；该行为已由 v8.6 的显式必填 `format` 契约取代，当前响应不读取 `Accept`、不发送 `Vary: Accept`。

**架构与代码质量**

- `server/image-proxy.js` 独立拥有 DNS、私网地址拒绝、DNS pinning、逐跳重定向复验、超时和有界读取；`api/cover.js` 不再依赖 `api/image.js` 的测试内部对象。
- 新增 ESLint 10 分层配置，分别建模浏览器脚本、CommonJS 服务与 ESM 工具；清理全部静态错误、无用变量、重复导入和历史测试死代码。
- 新增 `scripts/architecture-check.mjs`，阻止生产模块循环依赖、浏览器层越界、server 反向依赖 API、API handler 互相依赖。
- smoke suite 改为从真实聚焦模块组装测试能力，覆盖签名篡改、重复/额外 query、无密钥 fail-closed、真实格式嗅探、限流/并发、SSRF、JSON 错误 MIME 与完整 cover 协商。
- GitHub Actions 在 Node 22.13.0 最低边界与 Node 24 运行快速门禁，并新增 Linux Chrome 严格结构契约；Windows 像素 baseline 继续由本地 `verify:release` 校验，严格模式缺失任一场景 baseline 会失败。工作流 token 权限收窄为只读、不保留 checkout 凭据，checkout v7.0.0 与 setup-node v6.4.0 按完整 SHA 固定。原 `B-3` 跨平台 CI 缺口已关闭。

**版本与依赖**

- `package.json` / `package-lock.json` 升级到 `8.5.0` 并设置 `private: true`；Sharp、PostCSS、selector parser 与静态质量工具使用已锁定的当前版本。
- ASSET_VERSION 同步为 `20260710-v85`；README、架构文档、变更日志、环境变量示例和 release changeset 同步到 v8.5。

### v8.4 封面加载优化与缓存键一致性跟进（2026-06-27）

全局逐行复检后的性能收尾：新增专用封面缩略图链路，减少博客列表首屏图片体积；同时保留 v8.3 后续审查发现的移动星空缓存键一致性修复。无视觉布局变化。

**生产可见修复**

- 新增 `api/cover.js`：远程卡片封面统一生成 16:9 缩略图，支持 `320` / `640` / `960` 三档宽度，按 `Accept` 协商 AVIF / WebP / JPEG，并显式遵守 `q=0` 拒收格式。
- `js/blog-page.js` 的封面 `<img>` 现在带 `srcset` / `sizes`，首批封面 preload 也同步写入 `imagesrcset` / `imagesizes`，让移动端与桌面端都能拿到合适尺寸而不是原图。
- `api/image.js` 在保留 SSRF、MIME、跳转、大小限制和 SVG/XML 签名嗅探的前提下，对已知长度的远程 raster 图片改为流式透传，文章正文图片首字节更早到达浏览器。
- `scripts/local-server.mjs` 支持本地 `/api/cover`，本地开发与 Vercel serverless 路径一致。
- `css/style.css` 两条移动首页星空背景路径从 `mobile-home-starry-bg.svg?v=20260516-v78` 同步到 `mobile-home-starry-bg.svg?v=20260608-v84`，避免移动端继续命中过期背景资源缓存。

**Smoke check 配套**

- `scripts/smoke-check/image-proxy.mjs` 覆盖 `/api/cover` 真实 WebP 输出、`q=0` JPEG fallback、宽度拒绝、长缓存头、method guard，以及 `/api/image` streaming 行为。
- `scripts/smoke-check/content-modules.mjs` 覆盖封面 URL / `srcset` helper。
- `scripts/smoke-check.mjs` 锁定 `api/cover.js` 语法、前端 cover contract、本地 server 路由和 `sharp` 生产依赖，防止部署时缺失转码能力。
- `scripts/smoke-check.mjs` 新增移动星空背景 URL 断言，要求真实移动媒体块与 `html.is-mobile-device-viewport` fallback 均使用共享 `ASSET_VERSION`。
- 同时反向断言不再出现旧的 `mobile-home-starry-bg.svg?v=20260516-v78`。

**资产版本与验证**

- `package.json` / `package-lock.json` `8.3.0` → `8.4.0`；ASSET_VERSION `20260607-v83` → `20260608-v84`，活跃 `?v=` 引用（`js/app.js` + 三个 HTML + 移动星空背景 CSS URL）同步。
- README badge、`FIX_TODO.md` 顶部、`SITE_ARCHITECTURE.md` `> Version` 与 highlights 同步到 v8.4。
- 本轮发布前验证命令：`npm.cmd run check`、`npm.cmd run verify:release`、`npm.cmd audit --omit=dev`、`git diff --check`。

### v8.3 公开路由与列表状态硬化（2026-06-07）

全量逐行审查触发的一轮正确性与可维护性硬化：公开 post id 防护、分页解析收紧、博客列表 URL 规范化、书签 hash 边界修复，以及对应 smoke 覆盖。无视觉布局变化。

**生产可见修复**

- `api/post-data.js` / `api/post.js` 改用 `server/public-content.js` 的 `readPublicPostId`，只接受标准 Notion UUID 或 32 位紧凑 page id。`unsafe/post?debug=1` 这类 path-like id 会在进入 Notion 层前返回 `404 + no-store`。
- `js/site-utils.js` 只把 `#bookmarks` 和 `#bookmarks?...` 识别为书签列表路由，`#bookmarks-old` 等共享前缀的普通 hash 不再被误归一化成书签页。
- `js/blog-page.js` 会清理默认列表 query：`category=全部`、空 `search=`、`page=1`，并把 `?category=&search=&page=#bookmarks` 规范回 `/blog.html#bookmarks`。

**防御加固与可维护性**

- `server/public-content.js` / `server/post-service.js` / `server/notion-server.js` / `js/blog-page.js` / `js/site-utils.js` 的正整数分页解析统一为 strict digits：`2abc` 回退到 1，`02` 仍规范为 2。
- `js/blog-page.js` 初始 category/search query 长度与公开 API 对齐：category 128、search 256。
- `js/bookmark.js` 的 bookmark snapshot key 分隔符改为具名 escaped 常量，去掉源码里的原始控制字符字节，存储比较语义不变。

**Smoke check 配套**

- `scripts/smoke-check/api-contracts.mjs` 覆盖 invalid public post id 不触发上游 Notion 调用。
- `scripts/smoke-check/public-content-notion.mjs` 覆盖 `readPublicPostId`、strict positive integer、Notion 层分页规范。
- `scripts/smoke-check/blog-page.mjs` 覆盖默认 query 清理和空 query 书签 hash 清理。
- `scripts/smoke-check.mjs` 覆盖 bookmark hash 前缀误判、bookmark snapshot 原始控制字符检查、SSR post route invalid id。

**资产版本**

- `package.json` / `package-lock.json` `8.2.0` → `8.3.0`；ASSET_VERSION `20260529-v82` → `20260607-v83`，活跃 `?v=` 引用（`js/app.js` + 三个 HTML）同步。
- README badge、`FIX_TODO.md` 顶部、`SITE_ARCHITECTURE.md` `> Version` 与 highlights 同步到 v8.3。

### v8.2 安全与正确性硬化（2026-05-29）

全量代码审查触发的一轮硬化：1 个本地测试红灯根因修复 + 3 项防御加固。无运行时渲染或视觉变化。

**测试门禁根因修复（生产可见：本地 `npm run check`）**

- `scripts/smoke-check.mjs` 生产域名扫描改为基于 `git ls-files`（只扫版本控制内文件），并保留文件系统遍历作为 git 不可用时的兜底、其跳过目录集扩展为覆盖 `.gitignore` 里所有顶层目录。此前本地 `npm run check` 因 gitignored 的本地状态（`.claude/settings.local.json`，或写了 `SITE_URL=https://www.0000068.xyz` 的本地 `.env`）命中 “production domain hardcoding” 断言而红灯；现在本地行为与干净 CI checkout 一致，且只校验版本控制内的源码。

**防御加固（无外部行为变化）**

- `vercel.json` 把 `X-Content-Type-Options: nosniff` 从 `/api/(.*)` 提升到全局 `/(.*)` 头块并删除冗余的 `/api` 规则，HTML / 静态资源 / JSON 单一来源获得防嗅探；`SITE_ARCHITECTURE.md` 第 5 节头部说明同步。
- `js/notion-api.js` 客户端 `REQUEST_TIMEOUT` `8000 → 15000ms`，高于服务端 `NOTION_REQUEST_TIMEOUT_MS`（默认 12000ms）预算，慢但成功的上游响应不再被客户端提前 abort 误报失败。
- `server/post-service.js` `queryDatabasePages` 用 `Array.isArray` 守卫 `data.results`（与 `server/block-service.js` 对齐），上游返回异常结构时不再在分页中途抛错。

**资产版本**

- `package.json` `8.1.0` → `8.2.0`；ASSET_VERSION `20260528-v81` → `20260529-v82`，4 处活跃 `?v=` 引用（`js/app.js` + 三个 HTML）同步。
- README badge、`FIX_TODO.md` 顶部、`SITE_ARCHITECTURE.md` `> Version` 与 highlights 同步到 v8.2。

### v7.9 code quality pass (2026-05-21)

代码质量与正确性回归：1 个真实 bug 修复 + 5 项内部不变量加强 + 4 项可维护性清理。

**Bug 修复（生产可见）**

- `js/site-utils.js` 的 `sharedContent` 不再于 IIFE 顶部捕获 `window.NotionContentShared`，改为在每次调用 `sanitizeImageUrl` / `resolveProxiedDisplayImageUrl` / `resolveShareImageUrl` / `isLikelyEphemeralAssetUrl` 时 lazy 读取 `window.NotionContent`。生产环境下 NotionContent 通过 `loadPostRenderingChain()` 动态 import，capture 时尚未存在，导致 `if (typeof sharedContent.X === "function")` 永远 false、blog 卡片封面绕过 `/api/image` 直连 Notion S3。改完后封面图正确走代理。

**内部不变量加强（无外部行为变化）**

- `js/bookmark.js` `hydrateMissingMetadata` 把已 hydrated 的条目放进 `Map<id, entry>`，hydration 结束后重新读取 localStorage 并按 id 合并。避免在 hydration 异步等待期间用户 `toggle()` 的修改被旧快照覆盖。
- `js/bookmark.js` `storage` 事件用 `bookmarkSnapshotKey` 对比新旧值，相同则跳过 `bookmarks:updated` dispatch，避免跨 tab 等价写入触发无意义 re-render。
- `js/notion-api.js` 把 `postSummaryMemoryCache` + `postSummaryTimestampCache` 两个并行 Map 合并成单 `Map<id, {summary, timestamp}>`，消除需要手动同步的 invariant。
- `js/notion-api.js` `requestJsonWithTimeout` 改 `return await response.json()`，让 timeout / AbortController 覆盖到 JSON 解析阶段。
- `api/post.js` `applyPatches` 加入相邻 patch 重叠检测，发生重叠时立刻 throw 明确错误，而不是静默产出错乱 HTML。纯同位置插入（`start === end`）仍然允许并存。

**可维护性清理**

- 新增 `js/notion-content-shared.js` `DEFAULT_SHARE_IMAGE_PATH = "/og-image.jpg?v=4"`，作为 og-image 路径的单一来源；`api/post.js` / `server/render-service.js` / `js/spa-router.js` / `js/seo-meta.js` / `js/post-page.js` / `js/notion-content.js` / `scripts/inject-site-meta.mjs` / `scripts/smoke-check.mjs` 全部读取该常量。未来 cache-bust 仅需改一处。
- `js/spa-router.js` SPA 导航时按 `URL.pathname === "/css/style.css"` 精确匹配全局样式表，替代脆弱的 `[href*="style.css"]` 子串匹配。
- `scripts/local-server.mjs` denylist 加入 `node_modules`，本地 dev server 不再意外暴露依赖目录。
- `css/style.css` 触摸媒体查询里的 `.hero-search input` / `.blog-search input` 共用块拆开，消除被立刻覆盖的 4 个 declaration；`npm.cmd run mobile:fallbacks` 同步重生 `html.is-mobile-device-viewport` 镜像。
- `js/notion-content.js` `mapNotionPage` 通过 `normalizePostTags` 过滤 Notion `multi_select` 里 nullish / 空 tag 名。

**Smoke check 配套**

- `'new Set(["api", "node_modules", "server", "scripts"])'` denylist 字面量同步。
- `'if (!save(merged))'` 跟随 bookmark hydration 变量重命名。
- `defaultShareImagePath = SHARED_DEFAULT_SHARE_IMAGE_PATH` 改为从 `js/notion-content-shared.js` `createRequire` 读取，保留显式 equality assertion 防止常量被误改。

**资产版本**

- `package.json` `7.8.0` → `7.9.0`
- ASSET_VERSION `20260516-v78` → `20260521-v79`
- 32 处 HTML `?v=` 引用同步

### v7.3 mobile visual redesign (2026-05-16)

- Reworked the mobile home starfield with denser fine stars and a broader center glow.
- Tightened the mobile overview search, category filters, card details, and bottom dock so the page reads as a native mobile layout instead of enlarged desktop chrome.
- Updated the mobile visual contracts and cache key for the v7.3 release.

### v7.2 defense-in-depth + naming (2026-05-16)

- `scripts/build-mobile-fallbacks.mjs` `prefixRules` now skips `@keyframes` step children — `0% / from / to` selectors no longer get the `html.is-mobile-device-viewport` prefix that would yield invalid CSS.
- `api/image.js` adds body magic-byte sniffing on top of the MIME allow-list, rejecting `<?xml` / `<svg` / `<!DOCTYPE svg` payloads as 415 even when the upstream `Content-Type` claims a raster format.
- `js/bookmark.js` renames `BOOKMARK_METADATA_VERSION` to `BOOKMARK_METADATA_HYDRATION_GENERATION` and documents that it is a "force re-hydrate on read" trigger, not a real schema version. The stored property name is left untouched.

### v7.1 SSR performance (2026-05-16)

- Parsed post.html once per SSR render path through api/post.js createTemplateEditor, then applied accumulated DOM patches in one pass.
- Kept string-input SSR helper wrappers covered by smoke checks while the live success path uses the shared editor directly.

### v7.0 backlog (2026-05-16)

- Completed A-1: scripts/build-mobile-fallbacks.mjs derives html.is-mobile-device-viewport fallback CSS from the real touch media queries.
- npm.cmd run check now runs build-mobile-fallbacks --check before metadata and smoke checks, preventing generated CSS drift.

### v5.9 backlog（2026-05-15，本轮）

39 项已全部落地：

**Phase 1 – 发布元数据同步（4 项）**

- `package.json` `5.7.0` → `5.9.0`
- `README.md` badge `5.7.0` → `5.9.0`
- `SITE_ARCHITECTURE.md` `Version: v5.7` → `v5.9`
- 全局 asset 后缀 `20260515-r3-v57` → `20260515-v59`

**Phase 2 – 文档与现实同步（2 项）**

- `SITE_ARCHITECTURE.md` 第 5 节缓存表：拆分 `/api/posts-data`（`s-maxage=60`） / `/api/post-data`（`no-store`） / `/api/sitemap`（`s-maxage=300`） / `/api/robots`（`s-maxage=3600`）
- `SITE_ARCHITECTURE.md` 第 5 节追加 `/(.*)` 与 `/api/(.*)` headers 叠加生效说明

**Phase 3 – 死代码与冗余清理（8 项）**

- 删 `js/spa-router.js` 的 `navigator.mozConnection` / `navigator.webkitConnection`（Firefox/Chrome 前缀版早已下线）
- 删 `js/site-utils.js` 的 `nav.msMaxTouchPoints`（IE10/11 残留）
- 简化 `js/common.js` `getParticleProfileForViewport`：删 `shouldDisableMobileParticles` 包装、删 profile `disabled` 字段（恒等于 `isMobile`）
- `js/site-utils.js` `resolveDisplayImageUrl`：从 wrapper 函数改 `const` alias
- `js/notion-content-url.js` `resolveProxiedDisplayImageUrl`：从 wrapper 函数改 `const` alias
- `js/blog-page.js` `resolveSafeCoverImage`：三重嵌套三元 + 错缩进 → 2 层显式 if（中间层已是冗余透传）
- `server/notion-server.js` 顶部增加 harness 探针注释，解释为何 `require` 列表包含未导出符号
- 删 `js/common.js` `const ParticleCtor = Particle;` 别名

**Phase 4 – 一致性修复（6 项）**

- `server/category-navigation.js` `normalizeCategoryGradient` 增加 `radial-gradient` 支持 + 拒绝 `;`/`url()`，与 `js/site-utils.js` `sanitizeCoverBackground` 对齐
- `post.html` 给空状态链接添加 `data-empty-link` 属性；`js/post-page.js` 与 `api/post.js` 使用该属性查询/替换（attribute-order 无关）
- `js/index-page.js` `featuredCategory` inline 表达式抽出 `resolveFeaturedCategoryName` 函数
- `js/ui-effects.js` `window.initBlogCardReveal` 改 `window.UIEffects.initBlogCardReveal`，统一命名约定（audit 阶段移除了向后兼容的 legacy alias，因为唯一调用方已迁移）
- `vercel.json` 与 `/(.*)` `/api/(.*)` headers 叠加规则在 `SITE_ARCHITECTURE.md` 加注释
- 新建 `scripts/lib/dotenv.mjs` 共享 `.env` 解析；`scripts/local-server.mjs` 和 `scripts/notion-live-check.mjs` 改用共享 helper

**Phase 5 – 边界与容错硬化（4 项）**

- `server/notion-config.js` `createAsyncLimiter` 增加注释：`pendingResolvers` 无队列上限是因为上游 `NOTION_BLOCK_TOTAL_LIMIT=2000` 已限流；新增调用方须保持类似 budget
- `js/notion-content.js` LaTeX 解析器补齐 `\mathbb` / `\mathcal` / `\mathfrak` / `\mathbf` / `\mathsf` / `\mathtt`（通过 `mathvariant`）/ `\overline` / `\underline`（mover/munder）/ `\boxed`（menclose）
- `api/post.js` SSR 模板契约硬化：smoke check 增加 `postContent` placeholder / `postEmpty` 容器 / `data-empty-link` 锚点三项存在性 assertion；正则改 attribute-order 容忍 + 增加反序 fixture 测试
- `js/notion-api.js` 两处空 `catch(error) {}` 加 `console.debug`，明示意图

**Phase 6 – 风格 / 微优化（12 项）**

- `js/blog-page.js:935` `setTimeout(renderPosts, 300)` 加注释说明 300ms 与 bounce 动画时长（260ms）的关系
- `js/blog-page.js:550` categories 签名比对：`JSON.stringify` → per-field 比较
- `js/post-page.js` `canonicalUrl: canonicalUrl` 等多处冗余键值改属性简写
- `js/notion-article-renderer.js` 抽出 `CALENDAR_ICON_SVG` / `CLOCK_ICON_SVG` 共享常量；`js/notion-content.js` re-export；`js/blog-page.js` 使用共享常量；audit 阶段补充：在 `notion-content.js` 依赖校验块加入 icon 存在性检查，防止版本漂移
- `server/category-navigation.js` `buildCategoryPresentation` 每条目双调用 → 拆分为排序阶段 `configuredLabelFor` 与构造阶段
- `server/post-service.js` `queryPublicPosts` 先分页再 decorate，避免对全部结果做不必要工作
- `server/block-service.js` 双层并发控制加注释说明
- `js/spa-router.js` 加载新页样式表 `for...of await` → `Promise.all` 并行
- `js/seo-meta.js` initialOgUrl / initialCanonicalUrl 重复 DOM 查询合并
- `js/notion-content-utils.js` `sanitizeCssColorValue` 拒绝 modern 语法的设计意图加注释
- `js/post-page.js` `!notionApi` 分支与主流程清理路径合并为 `disposePostPage({ clearStructuredData })`
- `server/post-service.js` `filterPostsBySearch` 删除生产路径不可达的防御分支，简化逻辑

**Phase 7 – 架构性（2 项）**

- `css/style.css` 在 `html.is-mobile-device-viewport body {` 上方加大段注释说明双写架构；`scripts/smoke-check/mobile-layout.mjs` 新增 `.hero-section::after` 在两个块的 parity assertion（强制 width/height/top/background 一致），并锁定 v5.9 brightened opacity；真正的整合留作 backlog A-1
- `js/spa-router.js` `pageCache` 新增 `MAX_PAGE_CACHE_BYTES=2MB` 总量上限 + `MAX_PER_ENTRY_CACHE_BYTES=1MB` 单条上限；引入 `dropCacheEntry` / `evictOldestCacheEntry` 抽象，确保 byte 计数与 entry 增删同步

**Audit 收尾（4 项）**

- `js/notion-content.js` 依赖校验块加入 `CALENDAR_ICON_SVG` / `CLOCK_ICON_SVG` 存在性检查，防止 article-renderer 与 notion-content 版本漂移
- `js/ui-effects.js` 移除 legacy `window.initBlogCardReveal` alias（唯一调用方 blog-page 已迁移到 `window.UIEffects.initBlogCardReveal`）；同步移除 smoke fixture 中的旧字段
- `api/post.js` empty-state 替换正则改属性顺序无关 + 增加 fixture 测试 `href` 在 `data-empty-link` 前的反序 case
- 本文档重写：从"35 项 todo" → "全部完成 + 4 项架构性 backlog"

### 早期完成记录

v5.7 及之前的 22 项落地内容（A-1 templatePromise 自清 / A-2 SPA 滑动 TTL 修复 / A-3 HEAD 405 / A-5 sitemap+robots+posts-data s-maxage / A-6 filterPostsBySearch WeakMap / B-1 local-server denylist / B-3 Node >=22 + CI 22/24 / C-1 字体 CSP .com+.cn / C-2/3/4 vercel.json 安全 headers / C-5 frame-src 收窄 / D-1 inject-site-meta / D-2 favicon 缩至 29KB / E-2 LaTeX 深度限制 / E-3 Vimeo unlisted hash / F-1 toggle dispatch / F-4 storage 100ms 防抖 / G-2 bucketArrays 动态增长 / G-3 ctaHome click 不再重复 / G-5 nav active data-nav 驱动 / G-6 pendingPageFetches=4）保留在 git history。

---

## 四、验证命令

- 本地快速检查：`npm.cmd run check`
- 发布门禁（含严格视觉回归）：`npm.cmd run verify:release`
- 视觉回归：`npm.cmd run visual:check`
- 完整依赖审计：`npm.cmd audit --audit-level=low`
- 生产依赖审计：`npm.cmd audit --omit=dev`
- 直接依赖更新检查：`npm.cmd outdated --long`
- 干净安装锁文件检查：`npm.cmd ci --dry-run`
- diff 空白检查：`git diff --check`

v8.5 最终结果：提交前复检再次确认快速门禁、严格浏览器/像素回归、完整与生产依赖审计、直接依赖更新检查、干净安装锁文件检查、diff 空白检查全部通过；0 个已知依赖漏洞、0 个过期直接依赖。复检前已刷新 `origin/main`，与本地 `HEAD` 的分叉计数为 `0 0`。Notion live check 因本地未提供集成凭据按设计安全跳过。

v8.6 本地最终结果：完整快速门禁、严格 7 场景像素回归、CI 模式结构浏览器契约、完整与生产依赖审计、直接依赖更新检查、干净安装和 diff 空白检查全部通过；Linux Chrome 收尾没有放宽布局断言，并把 fine-pointer 分类从不稳定的 headless 设备仿真移到确定性行为 harness。
