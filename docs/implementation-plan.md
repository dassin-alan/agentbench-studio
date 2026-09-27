# AgentBench Studio 第一版实施计划

**目标：** 在 Windows 本地完成双前端项目的真实启动、统一 Playwright 测试、证据追踪、固定评分和三种报告导出。

**架构：** npm workspaces 单仓库。React/Vite 前端通过 Fastify API 与 SSE 读取任务状态；后端使用 JSON 原子持久化、子进程运行器、Playwright/axe/Lighthouse 质量检测和规则评分。仓库内置两个 Vite 示例项目用于真实端到端验收。

**技术栈：** React、TypeScript、Vite、Tailwind CSS、Fastify、Zod、Playwright、axe-core、Lighthouse、Vitest。

## 执行阶段

- [x] 建立 workspaces、TypeScript、Lint、Tailwind、开发代理和架构文档。
- [x] 测试先行实现 Schema、DSL、需求矩阵、评分、结论和路径安全。
- [x] 实现 JSON 原子存储、CRUD API、SSE、状态机和项目自动检测。
- [x] 实现 Windows 兼容进程启动、日志、URL 轮询、取消和进程树清理。
- [x] 实现 Playwright 基础检查、统一 DSL、多视口截图、axe 与 Lighthouse 容错。
- [x] 实现需求追踪、对比结论、HTML/Markdown/JSON 独立报告。
- [x] 实现 Dashboard、新建评测、运行中心、对比结果、证据中心五个页面。
- [x] 创建 Project A/B 与演示配置，跑通推荐 Project A 的真实端到端测试。
- [x] 执行 install、Playwright 安装、typecheck、lint、test、build、test:e2e 并修复。

## 最终验证

- 2026-07-18：`npm run typecheck`、`npm run lint`、20 项单元/API 测试、生产构建和 2 项真实端到端测试全部通过。
- E2E 已验证 Project B 核心详情测试失败、控制台错误捕获、Project A 推荐、三种报告生成，以及完成/中止后的端口释放。

## 验收边界

- 同一时间只运行一个评测；所有子进程在完成、失败、中止和服务退出时清理。
- 用户 DSL 只接受白名单动作，不执行 JavaScript 或 shell。
- Lighthouse 不可用时记录 skipped，不阻断整次评测。
- 未测试需求保持 untested，不作为已完成需求。
- 本地启动命令拥有当前用户权限，UI 与 README 必须展示安全提示。
