# AgentBench Studio v1.2

面向 AI 编程工作流的本地 Web 项目对比、测试与质量决策工具。

AgentBench Studio 使用同一套可执行测试和可追踪证据，判断两个 AI 生成的前端项目哪个更适合继续开发。它不是模型排行榜，不调用任何大模型 API，也不上传本地项目。

## v1.2 核心能力

- 双项目本地启动、URL 健康检查、stdout/stderr 实时日志和进程树清理
- Playwright 真实页面测试、桌面/移动截图、控制台与网络错误捕获
- 12 种严格 Zod 白名单 DSL；简单表单与 JSON 高级模式双向编辑
- axe 无障碍检查、Lighthouse 隔离审计和不可用降级
- 唯一 `finalizeEvaluation` 决策入口，统一生成 P0/P1/Warning、可比较性、置信度、发布判断和下一轮任务
- 显式 desktop/laptop/tablet/mobile 测试视口；日志、网络失败和截图准确归属到测试、步骤和视口
- 评分 v2 同时展示验证通过率、加权需求覆盖率、有效需求得分、证据等级、计算解释和分数上限
- 启动失败不生成综合分，未执行指标不按满分处理；开发基线与达到发布条件的项目严格区分
- HTML、Markdown、JSON 离线报告，默认隐藏绝对路径
- 四步新建向导、820px 以下 Dashboard 评测卡片和危险操作确认
- Windows 一键安装、启动、诊断和历史数据清理脚本
- 内置 Project A/B，可在没有自有项目时完成真实端到端演示

## 环境要求

- Windows 10/11
- Node.js 20+
- npm 10+
- Playwright Chromium、Chrome 或 Edge 任一可用

## Windows 一键安装与启动

解压项目后，在项目目录右键使用 PowerShell 运行：

```powershell
.\setup.ps1
```

安装完成后双击：

```text
start-agentbench.bat
```

脚本会自动定位自身目录、启动前后端，服务可用后打开 <http://127.0.0.1:3000>，退出时清理相关子进程。

环境诊断：

```powershell
.\doctor.ps1
```

清理历史运行记录（需要二次确认，保留 `data/demo`）：

```text
clean-data.bat
```

## 手动安装与运行

```powershell
cd <AgentBench-Studio-解压目录>
npm ci
npx playwright install chromium
npm run start
```

打开 <http://127.0.0.1:3000>。生产模式由 Fastify 同端口托管 Web 和 API，健康检查为 <http://127.0.0.1:3000/api/health>。

开发模式仍可使用 `npm run dev`；此时 Vite 为 3000，Fastify API 为 3001。

## 使用内置示例

1. 进入“新建评测”。
2. 点击“使用内置示例”。路径由后端根据当前仓库根目录动态计算，端口从 4173–4273 自动选择两个空闲项。
3. 依次检查项目、需求、统一测试和运行设置四个步骤。
4. 点击“开始评测”。
5. 在运行中心查看真实启动日志和 SSE 进度。
6. 完成后查看对比、需求证据和三种报告；预期推荐 Project A。

示例项目：

- `fixtures/project-a`：搜索、分类和详情通过，移动端正常，无严重控制台错误。
- `fixtures/project-b`：详情按钮故意无效，移动端轻微溢出，并产生明确控制台错误。

## 使用真实项目

- 本地路径可以指向存在的项目目录，例如 `<本地工作区>\candidate-a`，也可以直接指向单个 `.html` / `.htm` 文件。
- 单文件 HTML 检测后会自动填写 `agentbench:serve-html`，由内置静态服务器启动；不需要安装命令，访问地址保持项目配置中的端口和 `baseUrl`。
- ZIP 压缩包不能直接运行，请先解压后选择项目目录；从资源管理器复制路径时附带的外层引号会自动清理。
- 安装命令可选；只有启用“执行安装命令”并再次确认后才执行。
- 启动命令示例：`npm run dev -- --host 127.0.0.1 --port 4173 --strictPort`。
- 两个项目必须使用不同端口，`baseUrl` 必须与实际监听地址一致。
- 可选工作目录使用相对项目目录。
- “检测”按钮读取 `package.json`、lockfile 和 scripts，或识别单文件 HTML 并给出安全启动建议；检测本身不会执行候选项目命令。

> 仅运行你信任的本地项目。安装和启动命令具有当前用户权限。

## 测试 DSL

支持：`goto`、`click`、`fill`、`press`、`waitFor`、`expectVisible`、`expectHidden`、`expectText`、`expectUrl`、`expectCount`、`screenshot`、`wait`。

```json
[
  { "action": "goto", "path": "/" },
  { "action": "fill", "selector": "[data-testid=search]", "value": "Cursor" },
  { "action": "expectCount", "selector": "[data-testid=tool-card]", "count": 1 },
  { "action": "expectText", "selector": "[data-testid=tool-card]", "value": "Cursor" },
  { "action": "screenshot", "name": "search-result", "fullPage": true }
]
```

DSL 使用 `.strict()` 校验，不存在 `evaluate`、`script` 或 `shell` 动作。

每个测试用例通过 `viewports` 明确声明执行环境，缺失时兼容迁移为 `desktop`：

```json
{
  "id": "TEST-RESPONSIVE",
  "name": "桌面与移动端检查",
  "requirementId": "REQ-RESPONSIVE",
  "critical": false,
  "viewports": ["desktop", "mobile"],
  "steps": [{ "action": "expectVisible", "selector": "main" }]
}
```

## 数据与报告

真实运行数据保存在 `data/runs/<run-id>/`，默认被 `.gitignore` 排除。仓库只保留 `data/demo/demo-run.json` 脱敏展示摘要。

报告位于：

```text
data/runs/<run-id>/reports/
├─ report.html
├─ report.md
└─ report.json
```

默认 `includeAbsolutePaths: false`，三种报告只展示项目目录名。只有明确开启该选项才包含绝对路径。

## 开发与验证

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
npm run test:ui
npm run test:ui-demo
```

E2E 会真实启动两个 fixture、执行 Playwright/axe/Lighthouse、生成报告，并验证完成及中止后候选项目端口已释放。

## 安全与已知限制

- 没有 Docker 沙箱；未知或不可信项目不得直接运行。
- 暂不支持远程仓库、自动测试生成或自动修改候选项目。
- 同时只允许一个评测任务。
- Lighthouse 依赖可用浏览器；未执行时会显示原因、降低对应评分和置信度。
- 后端重启会恢复已保存状态，但不会续跑被操作系统终止的任务。
- 详细依赖审计和隐私说明见 [SECURITY.md](SECURITY.md)。
