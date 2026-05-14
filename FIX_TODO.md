# 修复清单

> 更新时间：2026-05-14
> 本文件为唯一权威修复清单。旧的 `统计待修复清单.MD` 和 `同步.md` 已合并删除。

---

## 一、当前待修任务（2026-05-14 三轮交叉审查产出）

经我 + 另一 AI + Codex 三轮交叉验证去伪，共 **31 项**有效问题，按"同区域文件 + 同类风险 + 同套验证"切分为 **7 个独立任务**。

### 执行顺序建议

```
Day 1  ──  Task A (生产可靠性)        ← 阻塞性最高
        ├──  Task B (本地开发 + Node)  ← 与 A 可并行
Day 2  ──  Task C (CSP/安全 Header)
        ├──  Task E (Notion 容错)      ← 与 C 可并行
Day 3  ──  Task D (SEO + favicon)
        ├──  Task F (书签事件)
Day 4  ──  Task G (清理收尾)
```

### Task 通用约束（交给 Codex 时一并附上）

```
1. 不要重构本任务范围之外的代码
2. 不要新增依赖包（除 Task B 的 dotenv 和 Task D 的图片工具明确批准）
3. 每个改动必须通过 `npm run check` 和 `npm run visual:check`
4. 不要写注释解释「修复了什么」——直接改代码
5. 不要写新的 .md 文档（除非任务里明确说要写）
6. 完成后只汇报：改了哪些文件、新增/删除了多少行、验收命令的输出
```

---

### Task A：生产 API 可靠性硬化 🔴

**目标**：消除生产环境 SSR 阻塞 / 缓存语义错误 / RFC 违规。

| ID | 优先级 | 文件 | 简述 |
|---|---|---|---|
| A-1 | 🔴 | [api/post.js:37-45](api/post.js#L37-L45) | `templatePromise` reject 后被永久缓存，加 `.catch(err => { templatePromise = null; throw err; })` |
| A-2 | 🔴 | [js/spa-router.js:147-180](js/spa-router.js#L147-L180) | `readPageHtmlFromCache` 命中后 `rememberPageHtml` 重置 `cachedAt`，TTL 变成**滑动 TTL**——用户连续访问同一页可永不过期（闲置超 5min 仍会正常过期）。读取时只调整 Map 顺序，保留原 `cachedAt` |
| A-3 | 🔴 | [server/public-content.js:45-54](server/public-content.js#L45-L54) | `rejectUnsupportedReadMethod` 只允许 GET，HEAD 返回 405 违反 RFC 9110。改为 `req.method === "GET" \|\| req.method === "HEAD"` |
| A-4 | 🟠 | [api/post.js:184-219](api/post.js#L184-L219) | SSR 模板替换全靠正则。模板顺序变化时虽有 `console.warn`（[api/post.js:66,78,128,175](api/post.js#L66)），但**仍会返回不完整 HTML**，前端只看 200。改用 jsdom 或显式占位注释（如 `<!--SSR:title-->`） |
| A-5 | 🟠 | [api/sitemap.js:51](api/sitemap.js#L51)、[api/robots.js:15](api/robots.js#L15)、[api/posts-data.js:23](api/posts-data.js#L23) | 加 `s-maxage`，使 CDN 可缓存 |
| A-6 | 🟢 | [server/post-service.js:201-224](server/post-service.js#L201-L224) | `filterPostsBySearch` 用 `Object.defineProperty` 给入参写 Symbol 副作用，改 `WeakMap` |

**验收**：`npm run check` + `npm run verify:release` 全绿；手动验证 SSR 模板失败恢复（kill 模板加载后重试返回 200）、cache TTL 真过期、`curl -I` 返回 200。

**估时**：3-4 小时。**依赖**：无。

---

### Task B：本地开发环境与 Node 治理 🔴

**目标**：消除 README dev 流程的静默断点 + 关闭本机敏感文件暴露 + 升级 Node。

| ID | 优先级 | 文件 | 简述 |
|---|---|---|---|
| B-1 | 🔴 | [scripts/local-server.mjs](scripts/local-server.mjs) | (1) 加 `.env` 加载（不依赖 dotenv 也可手写解析）；(2) `serveStatic` 加 denylist：`.env*`、`.git/`、`server/`、`api/`、`scripts/`、dotfiles 显式 403 |
| B-2 | 🟢 | [scripts/local-server.mjs:33-41](scripts/local-server.mjs#L33-L41) | API handler 改为按路由 lazy `require`，单文件失败不阻塞全局启动 |
| B-3 | 🟠 | [package.json:14](package.json#L14)、[.github/workflows/release-check.yml](.github/workflows/release-check.yml) | Node 18/20 已 EOL。`engines: ">=22"`；CI 矩阵改 `[22, 24]` |

**验收**：本地 `npm run dev` 后 `curl http://127.0.0.1:4173/.env` 返回 403、`/api/post.js` 返回 403；`.env` 中的 `NOTION_DATABASE_ID` 能被 API 读到；CI 在 Node 22/24 全绿。

**估时**：2-3 小时。**依赖**：无（与 Task A 可并行）。**注意**：升 Node 后跑一次完整 `npm run verify:release` 防 API 兼容性回归。

---

### Task C：CSP 与安全 Header 统一治理 🟠

**目标**：把分散在 `vercel.json` / `security-policy.js` / 3 个 HTML 的安全 Header 收敛，开放字体 CDN，收窄 frame-src。

| ID | 优先级 | 文件 | 简述 |
|---|---|---|---|
| C-1 | 🔴 | [index.html:7,17-25](index.html#L7)、[blog.html](blog.html)、[post.html](post.html)、[server/security-policy.js:22-24](server/security-policy.js#L22-L24) | 字体 CSP / `<link preconnect>` 仅白名单 `.cn`，海外用户字体永远 fallback。同时允许 `.com` 和 `.cn` |
| C-2 | 🟢 | [vercel.json](vercel.json) | 补 `Strict-Transport-Security: max-age=31536000; includeSubDomains` |
| C-3 | 🟢 | [vercel.json](vercel.json) | 补 `Referrer-Policy: strict-origin-when-cross-origin` |
| C-4 | 🟢 | [vercel.json](vercel.json) | 补 `Permissions-Policy: camera=(), microphone=(), geolocation=()` |
| C-5 | 🟢 | [index.html:7](index.html#L7)、[blog.html:7](blog.html#L7)、[post.html:8](post.html#L8)、[server/security-policy.js:26](server/security-policy.js#L26) | `frame-src 'self' https:` 过宽，收窄至 `youtube.com / bilibili.com / vimeo.com / codepen.io / figma.com / loom.com`，与 `resolveEmbeddableUrl` 白名单对齐 |
| C-6 | 🟢 | [vercel.json:46-57](vercel.json#L46-L57) + [server/security-policy.js](server/security-policy.js) + 3 HTML meta | CSP 实际分 3 层下发：Vercel 平台只下 `frame-ancestors 'none'`（meta 无法设）+ API 走 security-policy.js 完整 CSP + 静态页走 meta CSP。**不是重复，但 3 套定义易漂移**。建议统一管理（如 meta CSP 由 security-policy.js 同源生成） |

**验收**：浏览器 DevTools Network → Response Headers 看到全部新 Header；Console 无 CSP violation；海外 IP（VPN）测试 fonts.googleapis.com 能加载。

**估时**：2 小时。**依赖**：无。**注意**：改 CSP 后必跑 `npm run visual:check`，截图会反映字体差异。

---

### Task D：静态 HTML SEO + 品牌资源 🟠

**目标**：让 `SITE_URL` 真正驱动静态 HTML 元信息；拆分巨型 favicon。

| ID | 优先级 | 文件 | 简述 |
|---|---|---|---|
| D-1 | 🟠 | [index.html:13-16](index.html#L13-L16)、[blog.html:13-16](blog.html#L13-L16)、[post.html](post.html) | `og:url`/`og:image`/`canonical` 硬编码 `0000068.xyz`。新增 `scripts/inject-site-meta.mjs`，build/check 时从 `site.config.json.siteUrl` 注入 |
| D-2 | 🟠 | [favicon.png](favicon.png) + 三个 HTML | favicon.png 实测 **1.36 MB**，同时作 favicon 和 og:image。拆为 `favicon-32.png`、`apple-touch-icon.png`（180×180）、`og-image.jpg`（1200×630 ≤80KB） |
| D-3 | 🟢 | [index.html:86,99](index.html#L86)、[js/blog-page.js:651](js/blog-page.js#L651) | `ctaStart` aria-label/tooltip 硬编码"精选"；filter 按钮缺 `aria-pressed`。从 `site.config.json` featured 注入 + 加 aria |

**验收**：改 `site.config.json` 的 `siteUrl` 和 `featured.name` 后，重跑 inject 脚本，3 个 HTML 的 canonical/og:url 同步更新；favicon 总流量降至 100KB 以下。

**估时**：3-4 小时。**依赖**：无。**注意**：图片素材需用户准备或让 Codex 输出 `sharp` 生成脚本。

---

### Task E：Notion 内容解析容错 🟠

**目标**：让 Notion API 返回畸形数据时不整篇崩；LaTeX / Vimeo 边缘 case 不挂。

| ID | 优先级 | 文件 | 简述 |
|---|---|---|---|
| E-1 | 🟠 | [js/notion-content.js:769-786](js/notion-content.js#L769-L786) | `mapNotionBlock` 中 `block.paragraph.rich_text` 等未用可选链。全面加可选链 + 字段缺失 fallback |
| E-2 | 🟠 | [js/notion-content.js:540-601](js/notion-content.js#L540-L601) | LaTeX 互递归解析无深度限制可栈溢出。加 `depth` 参数，超 32 抛错并降级原文显示 |
| E-3 | 🟠 | [js/notion-content-url.js:139-144](js/notion-content-url.js#L139-L144) | Vimeo unlisted hash token 被丢弃致 403。保留第二段 path 转 `?h=…` |

**验收**：手动构造畸形 paragraph、深度嵌套 LaTeX、unlisted Vimeo 链接，全部不崩溃；`npm run check` 不回归。

**估时**：3-4 小时。**依赖**：无。**注意**：只在数据边界处加 guard，不要在容错路径上过度添加 try/catch。

---

### Task F：书签系统 + 事件机制 🟠

**目标**：toggle 类操作真正广播事件，删死代码 fallback，加跨标签防抖。

| ID | 优先级 | 文件 | 简述 |
|---|---|---|---|
| F-1 | 🟠 | [js/bookmark.js:192-237](js/bookmark.js#L192-L237) | `toggle`/`toggleById` 不调 `dispatchBookmarksUpdated()`，未来新增订阅者会踩坑。补上 dispatch |
| F-2 | 🟢 | [js/bookmark.js:113-121](js/bookmark.js#L113-L121) | CustomEvent fallback 构造 plain object 后 `dispatchEvent` 会 TypeError，现代浏览器永不进此分支。删除 |
| F-3 | 🟢 | [js/bookmark.js:104-111](js/bookmark.js#L104-L111)、[js/notion-api.js:295-302](js/notion-api.js#L295-L302) | `catch (error) { return false; }` 捕获但完全不使用 error，配额满 vs JSON 异常无法区分。改为 `catch (error) { console.debug(...); return false; }` |
| F-4 | 🟢 | [js/bookmark.js:303-316](js/bookmark.js#L303-L316) | 跨标签 storage 事件无防抖。加 100ms 防抖 |

**验收**：两标签页打开同一篇文章，A 收藏后 B 的 navBookmark 高亮立即同步；快速连续 toggle 不重复重渲染；删 fallback 后 `npm run check` 不报错。

**估时**：2 小时。**依赖**：无。

---

### Task G：前端清理与可维护性 🟢

**目标**：删死代码，去重，可访问性收尾。

| ID | 优先级 | 文件 | 简述 |
|---|---|---|---|
| G-1 | 🟢 | [js/blog-page.js:37-58](js/blog-page.js#L37-L58)、[js/notion-api.js:55-75](js/notion-api.js#L55-L75) | `@canonical-source` fallback 在 ESM 顺序加载下永不执行，删 ~150 行死代码 |
| G-2 | 🟢 | [js/common.js:141-161](js/common.js#L141-L161) | 粒子 `bucketArrays[color] = Array(particleCount)` 每色预分配 350 槽，改 `[]` 动态增长 |
| G-3 | 🟢 | [js/index-page.js:39-58](js/index-page.js#L39-L58) | CTA `click` handler 与 SPA router document 级监听重复（无害冗余），统一交给 SPA router |
| G-4 | 🟢 | [js/runtime-core.js:312-318](js/runtime-core.js#L312-L318) | `PageRuntime.register` 注册时立即 init，依赖 import 顺序——当前 `app.js` 顺序工作正常，**属维护性风险，非当前 bug**。建议拆开注册与启动，防 import 顺序调整时炸 |
| G-5 | 🟢 | [js/blog-page.js:585-591](js/blog-page.js#L585-L591) | top nav active 靠中文文本匹配（`text === "总览"`），改 `data-nav` 驱动 |
| G-6 | 🟢 | [js/spa-router.js:287-312](js/spa-router.js#L287-L312) | `pendingPageFetches` 按 cacheKey 去重但**无总量上限**，弱网 + 快速点击多个不同 URL 时可能堆积多个不可取消 fetch。修法二选一：(a) pending 达上限（建议 4）时**直接跳过新的 warm/prefetch 请求**；(b) 给可缓存 fetch 单独引入 `AbortController`，超出上限时 abort 最旧的 fetch。**不要只删 Map 条目**——`ignoreSignal: true` 下网络请求不会因 Map 删除而中断 |

**验收**：`npm run check` 全绿；`npm run visual:check` 截图无差异；改菜单 i18n 文案后 active 状态仍正确。

**估时**：3 小时。**依赖**：建议放在 Task F 之后（共享 bookmark.js / blog-page.js 编辑窗口）。

---

## 二、经核对不属实 — 无需修复（5 项，原 6 项中 1 项已降级为 G-6）

| 项 | 结论 |
|---|---|
| `createAsyncLimiter` 并发竞态 | Node.js 单线程 + 微任务 FIFO 串行执行，无 TOCTOU |
| `IMAGE_PROXY_MAX_REDIRECTS` 循环越界 | 1 次原始请求 + 最多 4 次跟随 = 5 请求，名实相符 |
| `sortPostsByDateDesc` 重复排序 | 三元表达式正确区分了 Notion 已排序 vs 客户端兜底 |
| Vercel 上 `sweep` 定时器不启动 | 有意设计，serverless 无后台进程，惰性清理足够 |
| `findPageFocusTarget` 匹配残留旧节点 | `innerHTML` 同步替换 + rAF 内查询，当前调用链不触发 |

> ⚠️ **降级记录**：原"`ignoreSignal: true` 堆积大量请求 — 不属实"的结论过于乐观。`pendingPageFetches` 按 cacheKey 去重，但**无总量上限**（`MAX_PAGE_CACHE_ENTRIES = 6` 只约束 pageCache，不约束 pendingPageFetches）。已重新降级为 **G-6**，弱网 + 快速点击多个不同 URL 时可能堆积。

---

## 三、历史完成记录

### Batch 1-8（2026-05-14 全部完成）

最近 commit：`f90b43b chore: finish remaining fix batches`

| Batch | commit | 范围 |
| --- | --- | --- |
| 1 死代码清理 | `9d872d4` | `P2-01/02/03/05/10/21`, `P3-02/10/12/13` |
| 2 `_searchText` 收敛 | `fdfaab5` | `P1-01`, `P1-02` |
| 3 a11y / SEO | `f44e2c6` | `P1-04`, `P2-15/18/19` |
| 4 分页窗口 | `5154ebb` | `P1-03` |
| 5 客户端资源 / 状态 | `d2f196b` | `P2-13`, `P2-14` |
| 6 服务端 hardening | `c412825` | `P2-04/06/09`, `P3-18` |
| 7 服务端缓存 / 资源限制 | `f90b43b` | `P2-07`, `P2-08`, `P2-12`, `P3-14` |
| 8 CI workflow | `f90b43b` | `P2-20`, `P3-11`, `P3-17`, `P3-20` |

### Batch 7 结果

- `P2-07`：`sessionStorage` 清扫增加节流，避免每次同步都全量扫描。
- `P2-08`：`block-service` 增加总块数预算，防止深层页面在服务端无限展开。
- `P2-12`：serverless 环境禁用后台 `setInterval` 清扫，保留按需清扫路径。
- `P3-14`：`createSingleFlight` 增加失败冷却，避免失败请求被高频重放。

### Batch 8 结果

- `P2-20`：CI release check 使用 Node `18/20/22` matrix（⚠️ 已被本轮 Task B-3 覆写为 `22/24`，待执行）。
- `P3-11`：README / 文档补充 `verify:release` 是发布门禁，`check` / `test` 是本地快速检查。
- `P3-17`：workflow 增加 `concurrency.group` 和 `cancel-in-progress`。
- `P3-20`：`scripts/release-check.mjs` 并行执行 smoke suite 和 strict visual regression。

### 额外收敛

- 客户端兜底数据不再生成或输出 `_searchText`，避免搜索索引字段重新外露到客户端 payload。
- `smoke-check` 增加 `_searchText` 泄漏守卫，覆盖 JS 源码与静态 fallback。
- `.env.example`、README、架构文档和 smoke 检查已同步新的缓存/资源限制配置。

---

## 四、历史 Backlog（按需启动，非阻塞）

| 编号 | 主题 | 类型 | 建议启动时机 |
| --- | --- | --- | --- |
| `P2-11` | `local-server` / `vercel.json` 路由单源 | 重构 | 下次改 rewrite 时顺手 |
| `P2-16` | `font-loader` / `spa-router` 路径统一 | 小重构 | 出现 FOIT/FOUT 反馈时 |
| `P2-17` | GPU 背景负载 | perf 优化 | Lighthouse 或真机发现压力后 |
| `P3-01` | data-attribute 序列化 helper | 小重构 | 与 `P3-08` 一起做 |
| `P3-03` | 粒子 holey array | 微优化 | 真测出帧率瓶颈后（⚠️ 与本轮 G-2 重叠） |
| `P3-04` | image proxy 单请求 DNS cache | 微优化 | 出现频繁同源重定向后 |
| `P3-05` | `spa-router` hash 分支可读性 | 重命名 | 顺手整理 |
| `P3-06` | `category-nav` 双调用拆分 | 小重构 | 顺手整理 |
| `P3-07` | `app.js` 动态 import | 中型重构 | 需要继续压小首屏 JS 时 |
| `P3-08` | 删除客户端 fallback 拷贝 | 重构 | 与 `P3-01` 一起做（⚠️ 与本轮 G-1 重叠） |
| `P3-15` | SPA 动画 class 化 | 小重构 | 顺手整理 |
| `P3-16` | unsupported block 默认静默 | 行为变更 | 与 dev/debug 开关一起做 |

---

## 五、验证命令

- 本地快速检查：`npm run check`
- 发布门禁：`npm run verify:release`
- 视觉回归：`npm run visual:check`
- diff 空白检查：`git diff --check`
