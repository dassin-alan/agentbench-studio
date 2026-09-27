import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "data", "ui-smoke");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const issues = [];
const failedRequests = [];
const expectedSseDisconnects = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("console", (message) => { if (["error", "warning"].includes(message.type())) issues.push(`${message.type()}: ${message.text()}`); });
  page.on("requestfailed", (request) => {
    const detail = `${request.method()} ${request.url()} ${request.failure()?.errorText ?? "failed"}`;
    if (request.url().endsWith("/events") && request.failure()?.errorText === "net::ERR_ABORTED") expectedSseDisconnects.push(detail);
    else failedRequests.push(detail);
  });
  await page.goto("http://127.0.0.1:3000/runs/new", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /使用内置示例/ }).click();
  await page.getByText(/已加载仓库内置 Project A/).waitFor();
  await page.getByRole("button", { name: /运行设置与确认/ }).click();
  await page.getByRole("button", { name: /开始评测/ }).click();
  await page.waitForURL(/\/runs\/[0-9a-f-]+$/i, { timeout: 15_000 });
  const runId = page.url().split("/").at(-1);
  await page.getByRole("link", { name: /查看对比结果/ }).waitFor({ timeout: 90_000 });
  await page.getByRole("link", { name: /查看对比结果/ }).click();
  await page.getByText(/当前版本存在发布阻断；建议继续基于 Project A · 稳定实现\s+修复/).waitFor({ timeout: 15_000 });
  await page.getByText("强证据覆盖率", { exact: true }).first().waitFor();
  await page.getByText("评测置信度", { exact: true }).first().waitFor();
  await page.getByText("发布判断", { exact: true }).first().waitFor();
  await page.screenshot({ path: path.join(output, "comparison-result.png"), fullPage: true });
  const htmlExport = await page.request.get(`http://127.0.0.1:3001/api/runs/${runId}/export/html`);
  const markdownExport = await page.request.get(`http://127.0.0.1:3001/api/runs/${runId}/export/markdown`);
  const jsonExport = await page.request.get(`http://127.0.0.1:3001/api/runs/${runId}/export/json`);
  if (![htmlExport, markdownExport, jsonExport].every((response) => response.ok())) throw new Error("One or more report exports failed");
  await page.getByRole("link", { name: /查看证据中心/ }).click();
  await page.getByText("TRACEABLE QUALITY EVIDENCE").waitFor();
  if (await page.locator(".evidence-images img").count() < 2) throw new Error("Evidence screenshots did not render");
  await page.screenshot({ path: path.join(output, "evidence-center.png"), fullPage: true });
  if (issues.length > 0) throw new Error(`Application console issues:\n${issues.join("\n")}`);
  if (failedRequests.length > 0) throw new Error(`Application network failures:\n${failedRequests.join("\n")}`);
  console.log(JSON.stringify({ passed: true, runId, recommended: "project-a", reports: ["html", "markdown", "json"], evidenceImages: await page.locator(".evidence-images img").count(), confidenceVisible: true, releaseJudgementVisible: true, consoleIssues: 0, failedRequests: 0, expectedSseDisconnects: expectedSseDisconnects.length, screenshots: ["data/ui-smoke/comparison-result.png", "data/ui-smoke/evidence-center.png"] }, null, 2));
} finally {
  await browser.close();
}
