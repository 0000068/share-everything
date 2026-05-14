# 修复清单

> 更新时间：2026-05-14
> 权威状态源：本文件。`统计待修复清单.MD` 和 `同步.md` 只保留摘要与同步记录。

## 当前结论

- Batch 1-8 已全部完成并提交；最近一轮功能/工程收口 commit 为 `f90b43b chore: finish remaining fix batches`。
- 所有 P1 行为/正确性问题已完成。
- 已排入 Batch 1-8 的 P2/P3 项已完成。
- 当前无已确认发布阻塞或用户可见待修项。
- P3-22 文档收口已完成：临时 `待修复清单.md` 已合并进本文件并移除。

## 已完成批次

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

## Batch 7 结果

- `P2-07`：`sessionStorage` 清扫增加节流，避免每次同步都全量扫描。
- `P2-08`：`block-service` 增加总块数预算，防止深层页面在服务端无限展开。
- `P2-12`：serverless 环境禁用后台 `setInterval` 清扫，保留按需清扫路径。
- `P3-14`：`createSingleFlight` 增加失败冷却，避免失败请求被高频重放。

## Batch 8 结果

- `P2-20`：CI release check 使用 Node `18/20/22` matrix。
- `P3-11`：README / 同步文档补充 `verify:release` 是发布门禁，`check` / `test` 是本地快速检查。
- `P3-17`：workflow 增加 `concurrency.group` 和 `cancel-in-progress`。
- `P3-20`：`scripts/release-check.mjs` 并行执行 smoke suite 和 strict visual regression。

## 额外收敛

- 客户端兜底数据不再生成或输出 `_searchText`，避免搜索索引字段重新外露到客户端 payload。
- `smoke-check` 增加 `_searchText` 泄漏守卫，覆盖 JS 源码与静态 fallback。
- `.env.example`、README、架构文档和 smoke 检查已同步新的缓存/资源限制配置。

## Backlog

以下是按需启动的非阻塞项，不影响当前功能与发布门禁。

| 编号 | 主题 | 类型 | 建议启动时机 |
| --- | --- | --- | --- |
| `P2-11` | `local-server` / `vercel.json` 路由单源 | 重构 | 下次改 rewrite 时顺手 |
| `P2-16` | `font-loader` / `spa-router` 路径统一 | 小重构 | 出现 FOIT/FOUT 反馈时 |
| `P2-17` | GPU 背景负载 | perf 优化 | Lighthouse 或真机发现压力后 |
| `P3-01` | data-attribute 序列化 helper | 小重构 | 与 `P3-08` 一起做 |
| `P3-03` | 粒子 holey array | 微优化 | 真测出帧率瓶颈后 |
| `P3-04` | image proxy 单请求 DNS cache | 微优化 | 出现频繁同源重定向后 |
| `P3-05` | `spa-router` hash 分支可读性 | 重命名 | 顺手整理 |
| `P3-06` | `category-nav` 双调用拆分 | 小重构 | 顺手整理 |
| `P3-07` | `app.js` 动态 import | 中型重构 | 需要继续压小首屏 JS 时 |
| `P3-08` | 删除客户端 fallback 拷贝 | 重构 | 与 `P3-01` 一起做 |
| `P3-15` | SPA 动画 class 化 | 小重构 | 顺手整理 |
| `P3-16` | unsupported block 默认静默 | 行为变更 | 与 dev/debug 开关一起做 |

## 验证

- `npm.cmd run check`
- `npm.cmd run verify:release`
- `git diff --check`
