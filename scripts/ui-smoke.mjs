import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "data", "ui-smoke");
const detectionZip = path.join(output, "detection-fixture.zip");
const detectionHtml = path.join(output, "detection-fixture.html");
const baseUrl = "http://127.0.0.1:3000";
const viewports = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "390x844", width: 390, height: 844 }
];
await mkdir(output, { recursive: true });
await writeFile(detectionZip, "project detection fixture", "utf8");
await writeFile(detectionHtml, "<!doctype html><title>Detection fixture</title><main>ready</main>", "utf8");
const browser = await chromium.launch({ headless: true });
const consoleIssues = [];
const failedRequests = [];
const checks = [];
let draftId;

async function auditPage(page, label) {
  const result = await page.evaluate(() => {
    const rootOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const keyContainers = [...document.querySelectorAll(".page,.run-list-panel,.run-card-list,.wizard-panel,.form-section")];
    const clippedContainers = keyContainers.filter((element) => element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 3 && getComputedStyle(element).overflowX === "hidden").map((element) => element.className);
    const targets = [...document.querySelectorAll("button,a.button,.row-actions a,.side-nav a")].filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    }).map((element) => { const rect = element.getBoundingClientRect(); return { label: element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 30) || element.tagName, width: Math.round(rect.width), height: Math.round(rect.height) }; });
    const undersized = targets.filter((target) => target.width < 36 || target.height < 36);
    return { rootOverflow, clippedContainers, undersized, targetCount: targets.length };
  });
  if (result.rootOverflow > 2) throw new Error(`${label} 页面横向溢出 ${result.rootOverflow}px`);
  if (result.clippedContainers.length > 0) throw new Error(`${label} 容器隐藏裁切：${result.clippedContainers.join(", ")}`);
  if (result.undersized.length > 0) throw new Error(`${label} 点击区域过小：${JSON.stringify(result.undersized.slice(0, 5))}`);
  checks.push({ label, ...result });
}

try {
  const context = await browser.newContext({ viewport: viewports[0] });
  const page = await context.newPage();
  page.on("console", (message) => { if (["error", "warning"].includes(message.type())) consoleIssues.push(`${message.type()}: ${message.text()}`); });
  page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? "failed"}`));

  const demoResponse = await page.request.get("http://127.0.0.1:3001/api/demo/config");
  if (!demoResponse.ok()) throw new Error(`Demo API HTTP ${demoResponse.status()}`);
  const createResponse = await page.request.post("http://127.0.0.1:3001/api/runs", { data: await demoResponse.json() });
  if (!createResponse.ok()) throw new Error(`Create draft HTTP ${createResponse.status()}`);
  draftId = (await createResponse.json()).id;

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const response = await page.goto(baseUrl, { waitUntil: "networkidle" });
    if (!response?.ok()) throw new Error(`Dashboard ${viewport.name} HTTP ${response?.status() ?? "no response"}`);
    if ((await page.locator("h1").first().textContent())?.trim() !== "评测工作台") throw new Error("Dashboard heading did not render");
    await auditPage(page, `dashboard-${viewport.name}`);
    if (viewport.width <= 820) {
      if (!await page.locator(".run-card-list").isVisible()) throw new Error("移动端评测卡片未显示");
      if (await page.locator(".run-table-wrap").isVisible()) throw new Error("移动端仍显示裁切表格");
      for (const label of ["Project A", "Project B", "推荐结果", "创建时间"]) if (await page.getByText(label, { exact: true }).count() === 0) throw new Error(`移动卡片缺少 ${label}`);
    }
    await page.screenshot({ path: path.join(output, `dashboard-${viewport.name}.png`), fullPage: true });
  }

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${baseUrl}/runs/new`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /保存草稿/ }).click();
  const validationNotice = page.locator(".error-notice");
  await validationNotice.getByText(/请填写评测名称/).waitFor();
  if ((await validationNotice.innerText()).includes("String must contain at least 1 character")) throw new Error("评测名称仍显示原始 Zod 错误");
  await page.getByLabel("本地路径").first().fill(`"${detectionZip}"`);
  await page.getByRole("button", { name: "检测" }).first().click();
  await validationNotice.getByText(/检测到 ZIP 文件；请先解压/).waitFor();
  await page.getByLabel("本地路径").first().fill(detectionHtml);
  await page.getByRole("button", { name: "检测" }).first().click();
  await page.getByText(/Project A：static/).waitFor();
  if (await page.getByLabel("启动命令").first().inputValue() !== "agentbench:serve-html") throw new Error("单文件 HTML 未配置内置静态服务器");
  await page.getByRole("button", { name: /使用内置示例/ }).click();
  await page.getByText(/已加载仓库内置 Project A/).waitFor();
  await page.getByRole("button", { name: /统一测试/ }).click();
  await page.getByRole("button", { name: "简单模式" }).first().waitFor();
  if (await page.locator(".simple-step-row").count() === 0) throw new Error("简单 DSL 编辑器未生成步骤表单");
  await auditPage(page, "wizard-tests-1280x720");
  await page.screenshot({ path: path.join(output, "wizard-tests-1280x720.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await auditPage(page, "wizard-tests-390x844");
  await page.screenshot({ path: path.join(output, "wizard-tests-390x844.png"), fullPage: true });

  const health = await page.request.get("http://127.0.0.1:3001/api/health");
  if (!health.ok()) throw new Error(`Health API HTTP ${health.status()}`);
  if (consoleIssues.length > 0) throw new Error(`Browser console issues:\n${consoleIssues.join("\n")}`);
  if (failedRequests.length > 0) throw new Error(`Failed network requests:\n${failedRequests.join("\n")}`);
  console.log(JSON.stringify({ passed: true, viewports: viewports.map(({ name, width, height }) => ({ name, width, height })), checks, mobileCards: true, simpleDslEditor: true, validationMessageLocalized: true, quotedZipDetectionMessage: true, singleHtmlDetection: true, consoleIssues: 0, failedRequests: 0, screenshots: [...viewports.map((viewport) => `data/ui-smoke/dashboard-${viewport.name}.png`), "data/ui-smoke/wizard-tests-1280x720.png", "data/ui-smoke/wizard-tests-390x844.png"] }, null, 2));
} finally {
  if (draftId) await fetch(`http://127.0.0.1:3001/api/runs/${draftId}`, { method: "DELETE" }).catch(() => undefined);
  await rm(detectionZip, { force: true });
  await rm(detectionHtml, { force: true });
  await browser.close();
}
