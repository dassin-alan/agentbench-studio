# AgentBench Studio 安全说明

## 安全边界

AgentBench Studio 会以当前用户权限执行用户填写的安装和启动命令。v1.2 不提供 Docker 或虚拟机沙箱，因此只应评测可信的本地项目。测试 DSL 使用 Zod 严格白名单，不支持 JavaScript、shell 或任意代码步骤；证据 API 只允许读取当前 run 的 artifacts 目录。

## 依赖审计

### v1.2 复核（2026-07-19）

加入生产静态托管后，首次审计发现 `@fastify/static 8.x` 的两个路径处理公告（GHSA-pr96-94w5-mx2h、GHSA-x428-ghpx-8j92），合并计为 1 个 moderate。未使用 `npm audit fix --force`；直接升级到修复版本 `@fastify/static 10.1.0`，并重新验证 Fastify 生产启动、SPA 回退、API、单元测试和 UI 流程。最终 `npm audit --json` 为 0 vulnerabilities。

Lighthouse 仍固定为 12.6.1，未重新引入此前的 Sentry/OpenTelemetry 间接漏洞链。

### v1.1 基线（2026-07-18）

升级前 `npm audit` 报告 18 项：1 项 low、17 项 moderate、0 high、0 critical。

- 17 项 moderate 来自 Lighthouse 12.8.2 间接依赖 `@sentry/node` 和旧版 OpenTelemetry。相关漏洞是 W3C Baggage 解析可能造成无界内存分配；AgentBench 不接收或传播外部 OpenTelemetry Baggage，实际暴露面较低，但发布包仍不应保留已知漏洞链。
- 1 项 low 来自 esbuild 0.27.7 的 Windows 开发服务器任意文件读取风险，需要本地权限和特定开发服务器访问条件。

处置结果：

- Lighthouse 固定到 12.6.1。该稳定版本支持 Node.js 20，并避开审计命中的 12.7+ Sentry/OpenTelemetry 依赖链。
- 使用 npm override 将 esbuild 统一到 0.28.1。
- 未使用 `npm audit fix --force`，也未升级到要求 Node.js 22.19 的 Lighthouse 13。
- 重新安装后 `npm audit` 结果为 0 vulnerabilities；完整 E2E 会继续验证 Lighthouse 兼容性。

## 漏洞处理策略

若后续审计出现无法安全升级的问题，发布报告必须记录漏洞来源、可达性、暂缓原因、补偿措施和复查版本。不得通过隐藏审计输出或强制破坏性升级获得“零漏洞”结果。

## 报告隐私

HTML、Markdown 和 JSON 报告默认仅显示项目目录名称。只有用户显式启用 `includeAbsolutePaths` 时才会写入绝对路径；公开分享报告前应保持该选项关闭。
