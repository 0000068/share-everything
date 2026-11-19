# v8.14 首屏封面加载体验与冷转码优化

Updated: 2026-11-19
Target: v8.14.0

- 博客卡片封面加载态移除不透明深黑内联底色，改为通透玻璃态底色与柔和流光骨架（遵守 `prefers-reduced-motion`），图片就绪后平滑淡入，失败时恢复分类渐变底色。
- 首行前 3 张封面均设为 `loading="eager"` 并行拉取（仅第 1 张 LCP 保留 `fetchpriority="high"`），`js/blog-bootstrap.js` 在列表 JSON 返回瞬间即预热前 3 张签名封面（`saveData` 下限制为 1 张），`js/blog-page.js` 原地复用已有预加载链接避免重复请求。
- `/api/cover` 默认并发槽由 2 提升至 3（匹配桌面首行三图），WebP / AVIF 编码 `effort` 调整为 2，加速冷缓存转码，同时保留 `sharp.strategy.attention` 智能构图；重构精简 `blog-page.js` / `notion-api.js` 冗余包装，使 `blog.html` 关键资源继续严格保持在 256 KiB 性能红线内。

## 验证

- `npm ci` 干净安装成功，`npm audit` / `npm run audit:dependencies` 均报告 0 个已知漏洞。
- Node 24.14.0 的 `npm run verify:release` 通过：ESLint（0 warnings）、46 模块架构边界检查、256 KiB 关键资源性能契约、完整 smoke/集成/并发回归、31 文件白名单静态构建与 7 场景严格视觉回归（`VISUAL_STRICT=1`，基线零漂移、未放宽）。
- 当前资源版本：`20261119-v814-f0a64aa6e4d7`。
