import { mkdir } from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Browser, type Page } from "playwright";
import { browserExecutableCandidates, findBrowserExecutable } from "./browser-resolution";
import {
  VIEWPORTS,
  type AccessibilityResult,
  type ArtifactReference,
  type BaseCheckResult,
  type BrowserLog,
  type ProjectConfig,
  type ProjectId,
  type ProjectResult,
  type RequestFailure,
  type ResponsiveResult,
  type RunSettings,
  type StartupResult,
  type TestCase,
  type TestCaseResult,
  type TestStep,
  type TestStepResult,
  type ViewportName
} from "@agentbench/shared";

type BrowserRunnerOptions = {
  runId: string;
  runDirectory: string;
  project: ProjectConfig;
  startup: StartupResult;
  testCases: TestCase[];
  settings: RunSettings;
  signal: AbortSignal;
  onLog: (level: "info" | "warning" | "error", message: string) => void;
  onArtifact: (artifact: ArtifactReference) => void;
};

type CaptureContext = { testCaseId: string; viewport: ViewportName; stepIndex?: number };
type Captures = { logs: BrowserLog[]; failures: RequestFailure[] };

const now = () => new Date().toISOString();
const sanitize = (value: string) => value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "capture";
const relativeArtifact = (...parts: string[]) => parts.join("/");

function uniqueLogs(logs: BrowserLog[]): BrowserLog[] {
  const seen = new Set<string>();
  return logs.filter((log) => {
    const key = `${log.type}|${log.message}|${log.url ?? ""}|${log.testCaseId ?? ""}|${log.stepIndex ?? ""}|${log.viewport ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueFailures(failures: RequestFailure[]): RequestFailure[] {
  const seen = new Set<string>();
  return failures.filter((failure) => {
    const key = `${failure.method}|${failure.url}|${failure.reason}|${failure.testCaseId ?? ""}|${failure.stepIndex ?? ""}|${failure.viewport ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export { browserExecutableCandidates };

async function launchBrowser(): Promise<Browser> {
  const executablePath = await findBrowserExecutable();
  if (!executablePath) throw new Error("Playwright 浏览器启动失败：未找到 Playwright Chromium、Chrome、Edge 或 PLAYWRIGHT_EXECUTABLE_PATH 指定文件。请运行 npx playwright install chromium。");
  try {
    return await chromium.launch({ headless: true, executablePath });
  } catch (error) {
    throw new Error(`Playwright 浏览器启动失败（${executablePath}）：${error instanceof Error ? error.message : String(error)}`);
  }
}

function attachCaptures(page: Page, captures: Captures, context: CaptureContext): void {
  const attribution = () => ({ testCaseId: context.testCaseId, viewport: context.viewport, ...(typeof context.stepIndex === "number" ? { stepIndex: context.stepIndex } : {}) });
  page.on("console", (message) => {
    if (message.type() !== "error" && message.type() !== "warning") return;
    captures.logs.push({ type: message.type() === "error" ? "error" : "warning", message: message.text(), url: message.location().url || page.url(), timestamp: now(), ...attribution() });
  });
  page.on("pageerror", (error) => captures.logs.push({ type: "pageerror", message: error.message, url: page.url(), timestamp: now(), ...attribution() }));
  page.on("requestfailed", (request) => {
    const reason = request.failure()?.errorText ?? "unknown request failure";
    captures.logs.push({ type: "requestfailed", message: `${request.method()} ${request.url()} · ${reason}`, url: request.url(), timestamp: now(), ...attribution() });
    captures.failures.push({ url: request.url(), method: request.method(), reason, resourceType: request.resourceType(), timestamp: now(), ...attribution() });
  });
}

async function screenshot(
  page: Page,
  options: BrowserRunnerOptions,
  artifacts: ArtifactReference[],
  testCaseId: string,
  index: number,
  viewport: string,
  label: string,
  fullPage: boolean
): Promise<string> {
  const fileName = `${options.project.id}-${sanitize(testCaseId)}-${String(index).padStart(2, "0")}-${viewport}-${sanitize(label)}.png`;
  const relativePath = relativeArtifact("artifacts", options.project.id, "screenshots", fileName);
  const absolutePath = path.join(options.runDirectory, ...relativePath.split("/"));
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await page.screenshot({ path: absolutePath, fullPage });
  const artifact: ArtifactReference = {
    id: `${options.project.id}-${testCaseId}-${index}-${viewport}-${sanitize(label)}`,
    projectId: options.project.id,
    type: "screenshot",
    relativePath,
    label,
    testCaseId,
    viewport
  };
  artifacts.push(artifact);
  options.onArtifact(artifact);
  return relativePath;
}

async function responsiveCheck(page: Page, viewport: string): Promise<ResponsiveResult> {
  const result = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const documentWidth = document.documentElement.scrollWidth;
    const oversizedElements = [...document.querySelectorAll<HTMLElement>("body *")]
      .map((element) => {
        const rectangle = element.getBoundingClientRect();
        return { selector: element.id ? `#${element.id}` : element.getAttribute("data-testid") ? `[data-testid=${element.getAttribute("data-testid")}]` : element.tagName.toLowerCase(), right: Math.round(rectangle.right), width: Math.round(rectangle.width) };
      })
      .filter((item) => item.right > viewportWidth + 2 || item.width > viewportWidth + 2)
      .sort((left, right) => right.right - left.right)
      .slice(0, 10);
    return { viewportWidth, documentWidth, oversizedElements };
  });
  const overflowAmount = Math.max(0, result.documentWidth - result.viewportWidth);
  return { viewport, hasHorizontalOverflow: overflowAmount > 2, documentWidth: result.documentWidth, viewportWidth: result.viewportWidth, overflowAmount, oversizedElements: result.oversizedElements };
}

async function executeStep(page: Page, step: TestStep, timeoutMs: number): Promise<void> {
  switch (step.action) {
    case "goto": await page.goto(new URL(step.path, page.url()).toString(), { waitUntil: "domcontentloaded", timeout: timeoutMs }); return;
    case "click": await page.locator(step.selector).click({ timeout: timeoutMs }); return;
    case "fill": await page.locator(step.selector).fill(step.value, { timeout: timeoutMs }); return;
    case "press":
      if (step.selector) await page.locator(step.selector).press(step.key, { timeout: timeoutMs });
      else await page.keyboard.press(step.key);
      return;
    case "waitFor": await page.locator(step.selector).waitFor({ state: step.state ?? "visible", timeout: step.timeoutMs ?? timeoutMs }); return;
    case "expectVisible": await page.locator(step.selector).first().waitFor({ state: "visible", timeout: timeoutMs }); return;
    case "expectHidden": await page.locator(step.selector).first().waitFor({ state: "hidden", timeout: timeoutMs }); return;
    case "expectText": {
      const locator = page.locator(step.selector).first();
      await locator.waitFor({ state: "visible", timeout: timeoutMs });
      const actual = (await locator.textContent()) ?? "";
      const matches = step.exact ? actual.trim() === step.value : actual.includes(step.value);
      if (!matches) throw new Error(`文本断言失败：期望${step.exact ? "精确等于" : "包含"}“${step.value}”，实际为“${actual.trim().slice(0, 300)}”`);
      return;
    }
    case "expectUrl": {
      const actual = page.url();
      const matches = (step.mode ?? "contains") === "equals" ? actual === step.value : actual.includes(step.value);
      if (!matches) throw new Error(`URL 断言失败：期望 ${step.mode ?? "contains"} ${step.value}，实际 ${actual}`);
      return;
    }
    case "expectCount": {
      await page.waitForTimeout(100);
      const actual = await page.locator(step.selector).count();
      if (actual !== step.count) throw new Error(`数量断言失败：${step.selector} 期望 ${step.count}，实际 ${actual}`);
      return;
    }
    case "screenshot": return;
    case "wait": await page.waitForTimeout(step.durationMs); return;
  }
}

const stepSelector = (step: TestStep): string | undefined => "selector" in step ? step.selector : undefined;

export function resolveTestViewports(testCase: TestCase, mobileEnabled: boolean): ViewportName[] {
  const configured: ViewportName[] = testCase.viewports?.length ? testCase.viewports : ["desktop"];
  return [...new Set(configured)].filter((viewport) => mobileEnabled || viewport !== "mobile");
}

async function runTestCase(browser: Browser, testCase: TestCase, viewportName: ViewportName, options: BrowserRunnerOptions, artifacts: ArtifactReference[], captures: Captures): Promise<TestCaseResult> {
  const viewport = VIEWPORTS[viewportName];
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const captureContext: CaptureContext = { testCaseId: testCase.id, viewport: viewportName };
  attachCaptures(page, captures, captureContext);
  const caseLogsStart = captures.logs.length;
  const caseFailuresStart = captures.failures.length;
  const startedAt = now();
  const start = Date.now();
  const steps: TestStepResult[] = [];
  const screenshots: string[] = [];
  let status: TestCaseResult["status"] = "passed";
  let caseError: string | undefined;
  try {
    await page.goto(options.project.baseUrl, { waitUntil: "domcontentloaded", timeout: options.settings.stepTimeoutMs });
    for (let index = 0; index < testCase.steps.length; index += 1) {
      if (options.signal.aborted) throw new Error("任务已由用户中止");
      const step = testCase.steps[index];
      if (!step) continue;
      captureContext.stepIndex = index;
      const stepStarted = Date.now();
      try {
        await executeStep(page, step, options.settings.stepTimeoutMs);
        const selector = stepSelector(step);
        const result: TestStepResult = { index, action: step.action, status: "passed", durationMs: Date.now() - stepStarted, viewport: viewportName, ...(selector ? { selector } : {}) };
        if (step.action === "screenshot") {
          const capture = await screenshot(page, options, artifacts, testCase.id, index, viewportName, step.name, step.fullPage ?? false);
          result.screenshot = capture;
          screenshots.push(capture);
        }
        steps.push(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        status = "failed";
        caseError = `步骤 ${index + 1} (${step.action}) 失败：${message}`;
        const selector = stepSelector(step);
        steps.push({ index, action: step.action, status: "failed", durationMs: Date.now() - stepStarted, viewport: viewportName, error: message, ...(selector ? { selector } : {}) });
        const capture = await screenshot(page, options, artifacts, testCase.id, index, viewportName, "failure", false).catch(() => undefined);
        if (capture) screenshots.push(capture);
        break;
      }
    }
  } catch (error) {
    status = "failed";
    caseError = error instanceof Error ? error.message : String(error);
  } finally {
    await context.close();
  }
  const result: TestCaseResult = {
    testCaseId: testCase.id,
    requirementId: testCase.requirementId,
    status,
    startedAt,
    completedAt: now(),
    durationMs: Date.now() - start,
    steps,
    screenshots,
    logs: captures.logs.slice(caseLogsStart),
    requestFailures: captures.failures.slice(caseFailuresStart),
    critical: testCase.critical,
    viewport: viewportName
  };
  if (caseError) result.error = caseError;
  return result;
}

async function runAccessibility(page: Page, enabled: boolean): Promise<AccessibilityResult> {
  if (!enabled) return { status: "skipped", violations: [], violationCount: 0, seriousCount: 0, criticalCount: 0, reason: "用户关闭了 axe 检测" };
  try {
    const analysis = await new AxeBuilder({ page }).analyze();
    const violations = analysis.violations.map((violation) => ({
      id: violation.id,
      title: violation.help,
      description: violation.description,
      impact: violation.impact ?? null,
      nodes: violation.nodes.flatMap((node) => node.target.map(String)),
      helpUrl: violation.helpUrl
    }));
    return {
      status: "completed",
      violations,
      violationCount: violations.length,
      seriousCount: violations.filter((violation) => violation.impact === "serious").length,
      criticalCount: violations.filter((violation) => violation.impact === "critical").length
    };
  } catch (error) {
    return { status: "failed", violations: [], violationCount: 0, seriousCount: 0, criticalCount: 0, reason: error instanceof Error ? error.message : String(error) };
  }
}

export async function runBrowserTests(options: BrowserRunnerOptions): Promise<ProjectResult> {
  const started = Date.now();
  const artifacts: ArtifactReference[] = [];
  const captures: Captures = { logs: [], failures: [] };
  const responsive: ResponsiveResult[] = [];
  let pageLoadDurationMs: number | undefined;
  let baseChecks: BaseCheckResult = { accessible: false, httpOk: false, hasTitle: false, hasVisibleContent: false, blankPage: true, severeErrorCount: 0 };
  let accessibility: AccessibilityResult | undefined;
  const testCases: TestCaseResult[] = [];
  const browser = await launchBrowser();
  try {
    for (const viewportName of (options.settings.testMobile ? ["desktop", "mobile"] : ["desktop"]) as Array<keyof typeof VIEWPORTS>) {
      const context = await browser.newContext({ viewport: VIEWPORTS[viewportName] });
      const page = await context.newPage();
      attachCaptures(page, captures, { testCaseId: "BASE", viewport: viewportName });
      const loadStarted = Date.now();
      try {
        const response = await page.goto(options.project.baseUrl, { waitUntil: "domcontentloaded", timeout: options.settings.stepTimeoutMs * 2 });
        await page.waitForTimeout(250);
        if (viewportName === "desktop") pageLoadDurationMs = Date.now() - loadStarted;
        const title = await page.title();
        const bodyText = ((await page.locator("body").innerText().catch(() => "")) ?? "").trim();
        if (viewportName === "desktop") {
          baseChecks = {
            accessible: true,
            httpOk: Boolean(response && response.status() >= 200 && response.status() < 400),
            ...(response ? { statusCode: response.status() } : {}),
            hasTitle: title.trim().length > 0,
            ...(title ? { title } : {}),
            hasVisibleContent: bodyText.length > 0,
            blankPage: bodyText.length < 3,
            severeErrorCount: 0
          };
        }
        responsive.push(await responsiveCheck(page, viewportName));
        await screenshot(page, options, artifacts, "BASE", 0, viewportName, "home-viewport", false);
        await screenshot(page, options, artifacts, "BASE", 1, viewportName, "home-full", true);
        if (viewportName === "desktop") accessibility = await runAccessibility(page, options.settings.runAxe);
      } catch (error) {
        if (viewportName === "desktop") baseChecks = { ...baseChecks, error: error instanceof Error ? error.message : String(error) };
      } finally {
        await context.close();
      }
    }

    for (const testCase of options.testCases) {
      const viewports = resolveTestViewports(testCase, options.settings.testMobile);
      if (viewports.length === 0) {
        testCases.push({ testCaseId: testCase.id, requirementId: testCase.requirementId, status: "skipped", startedAt: now(), completedAt: now(), durationMs: 0, steps: [], screenshots: [], logs: [], requestFailures: [], critical: testCase.critical, viewport: "mobile", error: "移动端测试已在运行设置中关闭" });
        continue;
      }
      for (const viewportName of viewports) {
        options.onLog("info", `执行 ${testCase.id} · ${testCase.name} · ${viewportName}`);
        const result = await runTestCase(browser, testCase, viewportName, options, artifacts, captures);
        testCases.push(result);
        options.onLog(result.status === "passed" ? "info" : "error", `${testCase.id} [${viewportName}] ${result.status === "passed" ? "通过" : `失败：${result.error ?? "未知错误"}`}`);
      }
    }
  } finally {
    await browser.close();
  }
  const browserLogs = uniqueLogs(captures.logs);
  baseChecks.severeErrorCount = browserLogs.filter((log) => log.type === "error" || log.type === "pageerror").length;
  const criticalFailed = testCases.some((testCase) => testCase.critical && testCase.status === "failed");
  const projectStatus: ProjectResult["status"] = !baseChecks.accessible ? "failed" : criticalFailed || baseChecks.severeErrorCount > 0 ? "partial" : "passed";
  return {
    projectId: options.project.id,
    status: projectStatus,
    startup: options.startup,
    baseChecks,
    testCases,
    browserLogs,
    requestFailures: uniqueFailures(captures.failures),
    responsive,
    ...(accessibility ? { accessibility } : {}),
    metrics: {
      startupDurationMs: options.startup.durationMs,
      ...(typeof pageLoadDurationMs === "number" ? { pageLoadDurationMs } : {}),
      testDurationMs: Date.now() - started
    },
    artifacts
  };
}

export function failedProjectResult(projectId: ProjectId, error: string, durationMs: number): ProjectResult {
  return {
    projectId,
    status: "failed",
    startup: { status: "failed", durationMs, error },
    baseChecks: { accessible: false, httpOk: false, hasTitle: false, hasVisibleContent: false, blankPage: true, severeErrorCount: 0, error },
    testCases: [], browserLogs: [], requestFailures: [], responsive: [], metrics: { startupDurationMs: durationMs, testDurationMs: durationMs }, artifacts: []
  };
}
