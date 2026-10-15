# v8.9 依赖安全与发布门禁

Updated: 2026-10-15
Target: v8.9.0

- 升级 Sharp 0.35.5、postcss-selector-parser 7.1.6，以及 brace-expansion / source-map-js 的修复版本；保留现有 Node 与 npm 版本要求。
- 本地发布门禁同时执行代码检查、正式构建、依赖审计和严格视觉回归，避免本地通过后才被 CI 的依赖检查阻断。
- CI 的两种 Node 版本均验证实际静态构建；依赖审计与本地使用同一脚本。

## 验证

- `npm run verify:release` 通过：ESLint、46 个生产模块的边界与循环依赖检查、完整 smoke/integration、31 个公开文件的正式构建、严格浏览器与像素回归。
- npm 审计报告 0 个已知漏洞；原有视觉基线未放宽或重新批准。
- 本版本的生成资源、package 与 lockfile 版本均已同步。

## 环境边界

本地 Windows、Node 24.14.0、npm 11.9.0。真实 Notion 联调需要配置凭据；本地回归使用受控输入。
