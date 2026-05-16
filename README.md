<p align="center">
  <img src="favicon.png" width="80" alt="Share Everything" />
</p>

<h1 align="center">Share Everything</h1>

<p align="center">
  <b>探索 · 记录 · 分享</b>
  <br />
  一个基于 Notion + Vercel 的轻量个人博客模板（beta）
</p>

<p align="center">
  <a href="https://www.0000068.xyz">🌐 在线演示</a> ·
  <a href="#快速开始">🚀 快速开始</a> ·
  <a href="#架构">📐 架构</a> ·
  <a href="#安全">🔒 安全</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-6.3.0-00e5ff?style=flat-square" alt="Version" />
  <img src="https://img.shields.io/badge/node-%3E%3D22-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node" />
  <img src="https://img.shields.io/badge/deploy-Vercel-000?style=flat-square&logo=vercel&logoColor=white" alt="Vercel" />
  <img src="https://img.shields.io/badge/CMS-Notion-000?style=flat-square&logo=notion&logoColor=white" alt="Notion" />
  <img src="https://img.shields.io/badge/framework-none-d500f9?style=flat-square" alt="No Framework" />
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT License" />
</p>

---

## 为什么做这个？

大多数博客系统要么依赖厚重的框架，要么需要本地数据库，要么要求你在 Markdown 文件里写文章。

**Share Everything** 的思路不同：

- ✏️ **在 Notion 里写文章**，放进配置好的公开数据库就上线
- ⚡ **零构建步骤**，没有 React/Vue/Next.js，纯 HTML + CSS + JS
- 🖥️ **SSR + SPA 混合**，首屏服务端渲染，后续导航丝滑无刷新
- 🔒 **面向公开部署的安全基线**，CSP nonce、SSRF 防护、XSS 白名单过滤
- 📱 **极致移动端体验**，首页极轻粒子，列表和文章页移动端静态背景优先阅读

---

## 特性

### 🎨 设计

- 深色玻璃拟态 (Glassmorphism) 设计语言
- Canvas 2D 粒子背景 + 多层光晕轨道动画
- 鼠标跟随光效
- 渐变文字标题 + 微交互动效
- 真实移动端 gate（窄视口 + 触控能力）优先，窄屏桌面保持桌面体验
- 保留旧版粒子、路由与光标动态，不使用 reduced-motion 弱化主动画

### 📝 内容

- Notion 数据库作为唯一内容源，公式块和行内公式渲染为 MathML
- 支持所有常见 Notion 块（段落、标题、列表、代码、引用、Callout、Toggle、Todo、表格、图片、嵌入、书签、公式等）
- YouTube / Bilibili / Vimeo / CodePen / Figma 嵌入自动转换
- 文章分类、标签、阅读时间自动提取
- 全文搜索（标题 + 摘要 + 标签）

### ⚡ 性能

- 字体延迟加载 (`media="print"` → `"all"`)
- 封面图预加载（前 3 张 `eager` + `fetchpriority="high"`）
- 后续图片全部 `lazy` + `decoding="async"`
- SPA 路由 HTML 缓存（5 分钟 / 最多 6 页）
- 悬停 + 聚焦预取（尊重 `saveData` 和 2G 网络）
- 服务端六层缓存体系 + 三层请求去重
- 真实移动端禁用粒子 canvas（桌面 350 个动态粒子保留），窄屏电脑不降级

### 🔒 安全

- 动态 CSP nonce 注入（SSR 页面）
- SSRF 多层防线（协议 / 本地域名 / 私网 IP / DNS 私网解析 / 已校验 IP 绑定 / 重定向逐跳校验 / 大小 / Content-Type）
- XSS 防护（HTML 转义 + URL 协议白名单 + CSS 值白名单）
- 旧 API 代理永久禁用 (410 Gone)
- 错误信息脱敏，仅调试模式暴露详情
- `frame-ancestors 'none'` + `X-Frame-Options: DENY` + HSTS / Referrer-Policy / Permissions-Policy
- 静态 HTML 的 CSP meta 用于静态 fallback；SSR 文章页会由 `api/post.js` 基于模板重写 CSP/OG/canonical，并通过响应 header 承载 `frame-ancestors`
- `scripts/smoke-check.mjs` 中关于 `shouldReduceMotion` / `prefers-reduced-motion` 的反向断言是动效常开设计守卫，不要作为无障碍修复顺手移除

### ♿ 无障碍

- SPA 导航后自动焦点管理
- `aria-live` 状态播报区域
- 书签按钮 `aria-pressed` 动态同步
- 博客网格 `role="list"` 语义标记
- 表格键盘滚动 (`tabindex="0"`)

---

## 架构

```
Notion Database
  → Notion API (v2022-06-28)
    → Vercel Serverless Functions (Hong Kong)
      → /api/posts-data     列表 JSON
      → /api/post-data      文章 JSON
      → /api/post           SSR 文章 HTML
      → /api/image          安全图片代理
      → /api/robots         动态 robots.txt
      → /api/sitemap        动态站点地图
        → Browser
          → 静态 HTML 外壳
          → SPA 路由导航
          → localStorage 本地书签
```

| 层级 | 技术 | 职责 |
|------|------|------|
| 内容源 | Notion API | 文章元数据与块内容 |
| 服务端 | Vercel Serverless | 公开 API、SSR、图片代理、robots、站点地图 |
| 前端 | 原生 HTML/CSS/JS | 静态页面 + 轻量 SPA |
| DNS | Cloudflare | 仅 DNS 解析 |
| 收藏 | localStorage | 纯本地存储 |

### 目录结构

```
.
├── index.html              首页 / 搜索入口
├── blog.html               博客列表 / 书签列表
├── post.html               文章模板（SSR 注入）
├── site.config.json        生产站点 URL fallback
├── api/
│   ├── posts-data.js       列表数据接口
│   ├── post-data.js        文章数据接口
│   ├── post.js             SSR 渲染器
│   ├── image.js            安全图片代理
│   ├── robots.js           robots.txt 生成
│   ├── sitemap.js          站点地图生成
│   └── notion.js           已禁用的旧代理 (410)
├── server/
│   ├── notion-server.js    服务端兼容导出层
│   ├── notion-client.js    Notion 请求、超时、错误包装
│   ├── notion-schema.js    属性名推断、schema 解析
│   ├── public-policy.js    公开访问策略
│   ├── post-service.js     列表、单篇、分页、搜索
│   ├── block-service.js    递归 block 获取
│   ├── cache-store.js      TTL / LRU / pending request
│   ├── render-service.js   SSR HTML 与结构化数据
│   ├── notion-config.js    环境变量、站点 URL、并发工具
│   ├── category-navigation.js  Notion 分类导航与展示映射
│   ├── security-policy.js  CSP 策略构建器
│   └── public-content.js   错误处理、输入验证
├── js/
│   ├── app.js              ES module 入口，按依赖顺序加载前端模块
│   ├── runtime-core.js     页面生命周期、进度条、焦点管理
│   ├── spa-router.js       SPA 路由、预取、过渡动画
│   ├── notion-content-shared.js  分类常量与默认展示令牌
│   ├── notion-content-utils.js  内容 Schema、转义、搜索文本工具
│   ├── notion-content-url.js  URL、图片代理与分享图策略
│   ├── notion-article-renderer.js  文章头部与外壳渲染
│   ├── notion-content.js   同构块渲染器 (SSR + 浏览器)
│   ├── notion-api.js       客户端 API 层、缓存
│   ├── blog-page.js        列表页逻辑
│   ├── post-page.js        文章页逻辑
│   ├── bookmark.js         收藏管理器
│   ├── site-utils.js       URL、图片、Hash 工具
│   ├── seo-meta.js         SPA SEO 元信息管理
│   ├── common.js           粒子系统
│   ├── ui-effects.js       光标光效
│   └── font-loader.js      字体延迟加载
├── css/
│   ├── style.css           全局设计令牌与共享样式
│   ├── blog-page.css       列表页样式
│   └── post-page.css       文章页样式
├── scripts/
│   ├── local-server.mjs    本地开发服务器
│   ├── smoke-check.mjs     冒烟测试（5800+ 行测试 / 约 350 个断言）
│   └── visual-regression.mjs  真实浏览器截图回归
└── vercel.json             路由、缓存、安全头
```

---

## 项目状态

当前定位是 **early open-source / beta** 的个人博客模板，适合愿意自己配置 Notion 数据库、Vercel 环境变量和公开内容边界的个人用户。它不是 fork 即用、适合所有人的生产级框架；请先在自己的 Notion 数据库和部署环境里跑通检查。

## 快速开始

### 前置条件

- [Node.js](https://nodejs.org/) ≥ 22
- 一个 [Notion](https://www.notion.so/) 数据库
- 一个 [Notion Integration Token](https://developers.notion.com/docs/getting-started)

### 1. 克隆仓库

```bash
git clone https://github.com/你的用户名/share-everything.git
cd share-everything
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# 必填
NOTION_TOKEN=ntn_xxxxxxxxxxxxxxxxxxxx
NOTION_DATABASE_ID=你的数据库ID

# 可选
SITE_URL=https://your-domain.example
DATABASE_METADATA_TTL_MS=300000
PUBLIC_PAGE_SUMMARY_CACHE_TTL_MS=120000
PUBLIC_POST_CACHE_TTL_MS=60000
NOTION_SINGLE_FLIGHT_ERROR_COOLDOWN_MS=2000
NOTION_REQUEST_TIMEOUT_MS=12000
NOTION_BLOCK_CHILD_CONCURRENCY=4
NOTION_BLOCK_TOTAL_LIMIT=2000
IMAGE_PROXY_TIMEOUT_MS=10000
IMAGE_PROXY_MAX_BYTES=8388608
IMAGE_PROXY_MAX_REDIRECTS=4
# 默认保持 v2.5 行为：整个配置的 Notion 数据库都作为公开内容读取。
# 请把草稿放到另一个数据库；公开/发布字段会被忽略。
```

### 3. 本地开发

```powershell
npm.cmd run dev
```

浏览器打开 `http://127.0.0.1:4173`

保持该终端窗口打开即可查看本地服务日志；停止时按 `Ctrl+C`。

### 4. 运行测试

```powershell
npm.cmd run check
```

`npm test` 与 `npm.cmd run check` 等价，会先跑 `inject-site-meta --check` 同步静态 HTML 元数据，再跑无浏览器依赖的 smoke suite，适合本地快速反馈。需要复核移动端/桌面视觉时：

```powershell
npm.cmd run visual:check
```

发布前建议运行严格检查：

```powershell
npm.cmd run verify:release
```

该命令会并行运行 smoke suite 和 `VISUAL_STRICT=1` 真实浏览器视觉回归，是发布与 CI 的严格门禁。视觉脚本会启动本地服务，优先使用本机 Chrome 或 Edge 的 headless + CDP 模式截图并执行布局契约断言，覆盖移动首页、移动总览、移动文章空态和桌面首页。普通 `visual:check` 在当前机器无法完成截图时会生成 skipped 报告；`verify:release` 会把这类浏览器不可用问题视为失败。

---

## 部署

### Vercel（推荐）

1. Fork 本仓库
2. 在 [Vercel](https://vercel.com) 导入项目
3. 添加环境变量 `NOTION_TOKEN` 和 `NOTION_DATABASE_ID`
4. 部署完成 ✅

项目自带 `vercel.json` 配置，无需额外设置。

### Notion 数据库设置

本项目推荐把 `NOTION_DATABASE_ID` 指向一个专门用于公开博客的 Notion 数据库。最小可用结构其实只需要一个 `Title` 类型属性；Notion 新数据库默认的 `Name` 字段就可以，不一定要改名为 `Title`。

推荐结构如下：

| 用途 | 默认可识别属性名 | 类型 | 是否必须 | 说明 |
|------|------|------|------|------|
| 标题 | `Name` / `Title` / `标题` | Title | 必须 | 文章标题；没有匹配到时会显示 `Untitled` |
| 分类 | `Category` / `分类` | Select | 可选 | 用于卡片分类和列表筛选；筛选栏会从 Notion 分类自动生成，见下方说明 |
| 标签 | `Tags` / `Tag` / `标签` | Multi-select | 可选 | 用于文章页标签和搜索 |
| 摘要 | `Excerpt` / `Summary` / `Description` / `摘要` | Rich text | 可选 | 用于卡片摘要、SEO 描述和搜索 |
| 日期 | `Date` / `Published At` / `Publish Date` / `发布日期` / `发布时间` | Date | 可选 | 用于排序和文章元信息；没有日期时仍会展示文章 |
| 阅读时间 | `ReadTime` / `Read Time` / `Reading Time` / `阅读时间` / `阅读时长` | Rich text | 可选 | 用于文章页元信息 |
| 封面 | Notion 页面封面 | Page cover | 可选 | 使用 Notion 页面自带封面；不是数据库属性 |
| 发布状态 | `Status` / `Public` / `Published` 等 | Status / Select / Checkbox | 可选 | 仅作为 Notion 内部管理字段；站点不会用它过滤文章 |

如果你使用自己的字段名，可以用环境变量覆盖候选名，多个名字用英文逗号分隔：

```env
NOTION_TITLE_PROPERTY_NAMES=Name,Title,文章名
NOTION_CATEGORY_PROPERTY_NAMES=Category,分类,栏目
NOTION_TAGS_PROPERTY_NAMES=Tags,Tag,标签
NOTION_EXCERPT_PROPERTY_NAMES=Excerpt,Summary,Description,摘要
NOTION_DATE_PROPERTY_NAMES=Date,Published At,Publish Date,发布日期
NOTION_READ_TIME_PROPERTY_NAMES=ReadTime,Read Time,Reading Time,阅读时间
```

#### 分类筛选说明

分类导航现在以 Notion 为主要来源，不要求用户去改前端 JS：

- `全部` 会一直显示，用来进入完整文章列表。
- `精选` 会一直固定显示，作为项目默认的推荐入口；如果你想让文章出现在精选里，把文章的 `Category` 设为 `精选`。
- 其他分类会优先读取 Notion 数据库里 `Category` 这个 Select 字段的选项，比如 `生活`、`读书`、`AI`、`项目记录`、`随笔`、`设计`、`摄影`。
- 如果文章里出现了数据库选项之外的分类，列表 API 也会把它合并进分类导航。
- 点击分类按钮时，会请求 `Category` 等于该分类名的文章。
- 如果数据库没有 `Category` 属性，网站仍能使用，只是除了 `全部` 和固定的 `精选` 外不会生成额外分类。

`site.config.json` 只负责控制分类展示方式，不再作为分类来源。你可以用它固定 `精选` 的显示，也可以给 Notion 分类补充排序、显示名、emoji 和颜色：

```json
{
  "categoryNavigation": {
    "featured": {
      "name": "精选",
      "emoji": "🌟",
      "label": "精选"
    },
    "order": ["精选", "AI", "读书"],
    "displayNames": {
      "AI": "AI Lab"
    },
    "emojis": {
      "AI": "🤖",
      "读书": "📚"
    },
    "colors": {
      "AI": {
        "bg": "rgba(41, 121, 255, 0.1)",
        "text": "#2979ff",
        "border": "rgba(41, 121, 255, 0.2)",
        "gradient": "linear-gradient(135deg, #0d1b4b, #1a3a6b)"
      }
    }
  }
}
```

如果不配置这些展示项，网站也会根据 Notion 分类自动生成基础按钮和默认颜色。

> **公开策略**：本项目长期保持 v2.5 行为：默认读取并展示整个 `NOTION_DATABASE_ID` 指向的 Notion 数据库，不要求公开/发布字段，也不会根据这些字段过滤。请只把可公开内容放进这个数据库；草稿建议放到单独的 Notion 数据库。

---

## 环境变量参考

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `NOTION_TOKEN` | ✅ | — | Notion Integration Token |
| `NOTION_DATABASE_ID` | ✅ | — | Notion 数据库 ID |
| `SITE_URL` | ❌ | `site.config.json` | 站点根 URL；环境变量优先 |
| `NOTION_TITLE_PROPERTY_NAMES` | ❌ | `Name,Title,标题` | 标题属性候选名 |
| `NOTION_CATEGORY_PROPERTY_NAMES` | ❌ | `Category,分类` | 分类属性候选名 |
| `NOTION_TAGS_PROPERTY_NAMES` | ❌ | `Tags,Tag,标签` | 标签属性候选名 |
| `NOTION_EXCERPT_PROPERTY_NAMES` | ❌ | `Excerpt,Summary,Description,摘要` | 摘要属性候选名 |
| `NOTION_DATE_PROPERTY_NAMES` | ❌ | `Date,Published At,Publish Date,发布日期,发布时间` | 日期属性候选名 |
| `NOTION_READ_TIME_PROPERTY_NAMES` | ❌ | `ReadTime,Read Time,Reading Time,阅读时间,阅读时长` | 阅读时间属性候选名 |
| `DATABASE_METADATA_TTL_MS` | ❌ | `300000` | 数据库元数据缓存时间 (ms) |
| `PUBLIC_PAGE_SUMMARY_CACHE_TTL_MS` | ❌ | `120000` | 页面摘要缓存时间 (ms) |
| `PUBLIC_POST_CACHE_TTL_MS` | ❌ | `60000` | 单篇文章缓存时间 (ms) |
| `NOTION_SINGLE_FLIGHT_ERROR_COOLDOWN_MS` | ❌ | `2000` | 元数据/列表 single-flight 失败后的短冷却窗口 (ms) |
| `NOTION_REQUEST_TIMEOUT_MS` | ❌ | `12000` | Notion API 超时 (ms) |
| `NOTION_BLOCK_CHILD_CONCURRENCY` | ❌ | `4` | 块子元素并发获取数 |
| `NOTION_BLOCK_TOTAL_LIMIT` | ❌ | `2000` | 单篇文章递归获取的最大 Notion block 数 |
| `IMAGE_PROXY_TIMEOUT_MS` | ❌ | `10000` | 图片代理上游请求超时 (ms) |
| `IMAGE_PROXY_MAX_BYTES` | ❌ | `8388608` | 图片代理最大响应体字节数 |
| `IMAGE_PROXY_MAX_REDIRECTS` | ❌ | `4` | 图片代理最大重定向跳数 |
| `EXPOSE_PUBLIC_ERROR_DETAILS` | ❌ | `false` | 是否在 API 响应中暴露详细错误 |

---

## 技术栈

<table>
  <tr>
    <td align="center"><b>前端</b></td>
    <td>HTML5 + CSS3 + Vanilla JavaScript（零框架）</td>
  </tr>
  <tr>
    <td align="center"><b>后端</b></td>
    <td>Node.js Serverless Functions (Vercel)</td>
  </tr>
  <tr>
    <td align="center"><b>CMS</b></td>
    <td>Notion API v2022-06-28</td>
  </tr>
  <tr>
    <td align="center"><b>部署</b></td>
    <td>Vercel (Hong Kong Region)</td>
  </tr>
  <tr>
    <td align="center"><b>设计</b></td>
    <td>Glassmorphism + Canvas 2D 粒子 + 微交互</td>
  </tr>
  <tr>
    <td align="center"><b>字体</b></td>
    <td>Google Sans + Inter</td>
  </tr>
  <tr>
    <td align="center"><b>测试</b></td>
    <td>自定义冒烟测试 + 真实浏览器截图回归（零三方依赖）</td>
  </tr>
</table>

---

## 开源协议

[MIT](LICENSE) © Share Everything

---

<p align="center">
  <sub>用 ❤️ 和 Notion 构建</sub>
</p>
