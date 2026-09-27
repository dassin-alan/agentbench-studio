import path from "node:path";
import net from "node:net";
import type { BenchmarkRunInput, Requirement, TestCase } from "@agentbench/shared";

export const demoRequirements: Requirement[] = [
  { id: "REQ-001", title: "展示 AI 工具列表", description: "首页展示六个工具卡片", priority: "must" },
  { id: "REQ-002", title: "搜索工具", description: "输入名称后实时过滤", priority: "must" },
  { id: "REQ-003", title: "按类别筛选", description: "选择分类只显示对应工具", priority: "must" },
  { id: "REQ-004", title: "打开工具详情", description: "点击详情按钮显示说明", priority: "must" },
  { id: "REQ-005", title: "支持移动端", description: "390px 视口无明显横向溢出", priority: "should" },
  { id: "REQ-006", title: "无阻断级错误", description: "页面加载和关键操作无严重错误", priority: "must" }
];

export const demoTestCases: TestCase[] = [
  { id: "TEST-001", name: "页面加载与工具列表", requirementId: "REQ-001", critical: true, steps: [
    { action: "goto", path: "/" },
    { action: "expectVisible", selector: "[data-testid=tool-grid]" },
    { action: "expectCount", selector: "[data-testid=tool-card]", count: 6 },
    { action: "screenshot", name: "tool-list", fullPage: true }
  ] },
  { id: "TEST-002", name: "搜索 Cursor", requirementId: "REQ-002", critical: true, steps: [
    { action: "goto", path: "/" },
    { action: "fill", selector: "[data-testid=search]", value: "Cursor" },
    { action: "expectCount", selector: "[data-testid=tool-card]", count: 1 },
    { action: "expectText", selector: "[data-testid=tool-card]", value: "Cursor" },
    { action: "screenshot", name: "search-cursor" }
  ] },
  { id: "TEST-003", name: "分类筛选", requirementId: "REQ-003", critical: true, steps: [
    { action: "goto", path: "/" },
    { action: "click", selector: "[data-testid=category-coding]" },
    { action: "expectCount", selector: "[data-testid=tool-card]", count: 3 },
    { action: "screenshot", name: "category-coding" }
  ] },
  { id: "TEST-004", name: "打开详情", requirementId: "REQ-004", critical: true, steps: [
    { action: "goto", path: "/" },
    { action: "click", selector: "[data-testid=details-cursor]" },
    { action: "waitFor", selector: "[data-testid=detail-dialog]", state: "visible" },
    { action: "expectText", selector: "[data-testid=detail-dialog]", value: "Cursor" },
    { action: "screenshot", name: "tool-detail" }
  ] },
  { id: "TEST-005", name: "移动端页面证据", requirementId: "REQ-005", critical: false, viewports: ["mobile"], steps: [
    { action: "goto", path: "/" },
    { action: "expectVisible", selector: "main" },
    { action: "screenshot", name: "mobile-home", fullPage: true }
  ] },
  { id: "TEST-006", name: "基础正文可访问", requirementId: "REQ-006", critical: true, steps: [
    { action: "goto", path: "/" },
    { action: "expectVisible", selector: "body" },
    { action: "expectText", selector: "h1", value: "AI 工具目录" }
  ] }
];

export function getDemoRunInput(repoRoot: string, ports: readonly [number, number] = [4173, 4174]): BenchmarkRunInput {
  return {
    name: "内置示例：AI 工具目录双项目评测",
    description: "使用真实 Vite 项目验证搜索、分类、详情、移动端和错误捕获。",
    projects: [
      {
        id: "project-a", name: "Project A · 稳定实现", sourceAgent: "Codex Demo", localPath: path.join(repoRoot, "fixtures", "project-a"),
        startCommand: `npm run dev -- --host 127.0.0.1 --port ${ports[0]} --strictPort`, port: ports[0], baseUrl: `http://127.0.0.1:${ports[0]}`, startupTimeoutMs: 30_000
      },
      {
        id: "project-b", name: "Project B · 视觉原型", sourceAgent: "Gemini Demo", localPath: path.join(repoRoot, "fixtures", "project-b"),
        startCommand: `npm run dev -- --host 127.0.0.1 --port ${ports[1]} --strictPort`, port: ports[1], baseUrl: `http://127.0.0.1:${ports[1]}`, startupTimeoutMs: 30_000
      }
    ],
    requirements: structuredClone(demoRequirements),
    testCases: structuredClone(demoTestCases),
    settings: { runInstall: false, runLighthouse: true, runAxe: true, testMobile: true, includeAbsolutePaths: false, startupTimeoutMs: 30_000, stepTimeoutMs: 6_000 }
  };
}

const portAvailable = (port: number): Promise<boolean> => new Promise((resolve) => {
  const server = net.createServer();
  server.once("error", () => resolve(false));
  server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
});

export async function getDemoRunInputWithAvailablePorts(repoRoot: string): Promise<BenchmarkRunInput> {
  const selected: number[] = [];
  for (let port = 4173; port <= 4273 && selected.length < 2; port += 1) if (await portAvailable(port)) selected.push(port);
  if (selected.length < 2 || selected[0] === undefined || selected[1] === undefined) throw new Error("未找到两个可用的本地演示端口（4173-4273）");
  return getDemoRunInput(repoRoot, [selected[0], selected[1]]);
}
