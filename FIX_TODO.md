# 修复清单

> 更新时间：2026-05-16（v7.2 发布）

---

## 一、当前待修任务

> 当前无活跃修复任务。下一轮审查产出新条目时填入此处。

---

## 二、需评估再启动的架构性 backlog

| ID | 简述 | 触发条件 |
|---|---|---|
| `B-2` | **菜单 active 状态 i18n-safe 校验**。`js/blog-page.js:506-516` 使用 `button.dataset.nav === "bookmarks"` / `"overview"` 区分激活按钮（之前是中文文本匹配，已重构）。当前 data 值是英文 key，i18n 安全。**触发再审**：站点引入运行时多语言切换时确认 data-nav 仍是 stable key。 |

---

## 三、历史完成记录

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
- diff 空白检查：`git diff --check`
