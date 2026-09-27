import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import type { LighthouseResult } from "@agentbench/shared";
import { findBrowserExecutable } from "../playwright/browser-resolution";

export type IsolatedNodeResult = {
  status: "completed" | "failed" | "timeout" | "cancelled";
  stdout: string;
  stderr: string;
  exitCode: number | null;
};

async function killProcessTree(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, shell: false, stdio: "ignore" });
      killer.once("exit", () => resolve());
      killer.once("error", () => resolve());
    });
    return;
  }
  try { child.kill("SIGKILL"); } catch { /* already exited */ }
}

export function runIsolatedNode(source: string, timeoutMs: number, signal?: AbortSignal, environment: Record<string, string> = {}): Promise<IsolatedNodeResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--input-type=module", "--eval", source], {
      cwd: process.cwd(),
      windowsHide: true,
      shell: false,
      env: { ...process.env, ...environment },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    const finish = (status: IsolatedNodeResult["status"], exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve({ status, stdout, stderr, exitCode });
    };
    const timer = setTimeout(() => { void killProcessTree(child).finally(() => finish("timeout", child.exitCode)); }, timeoutMs);
    const onAbort = () => { void killProcessTree(child).finally(() => finish("cancelled", child.exitCode)); };
    signal?.addEventListener("abort", onAbort, { once: true });
    child.once("error", (error) => { stderr += error.message; finish("failed", child.exitCode); });
    child.once("exit", (code) => finish(code === 0 ? "completed" : "failed", code));
    if (signal?.aborted) onAbort();
  });
}

const LIGHTHOUSE_WORKER = String.raw`
const chromeLauncherModule = await import(process.env.AGENTBENCH_CHROME_LAUNCHER_URL);
const lighthouseModule = await import(process.env.AGENTBENCH_LIGHTHOUSE_URL);
let chrome;
try {
  chrome = await chromeLauncherModule.launch({
    chromePath: process.env.AGENTBENCH_CHROME_PATH,
    chromeFlags: ["--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]
  });
  const audit = await lighthouseModule.default(process.env.AGENTBENCH_TARGET_URL, {
    port: chrome.port,
    output: "json",
    logLevel: "silent",
    onlyCategories: ["performance", "accessibility", "best-practices", "seo"]
  });
  if (!audit) throw new Error("Lighthouse 未返回结果");
  const categories = audit.lhr.categories;
  const audits = audit.lhr.audits;
  const output = {
    status: "completed",
    categories: {
      performance: categories.performance?.score ?? null,
      accessibility: categories.accessibility?.score ?? null,
      bestPractices: categories["best-practices"]?.score ?? null,
      seo: categories.seo?.score ?? null
    },
    metrics: {
      ...(typeof audits["first-contentful-paint"]?.numericValue === "number" ? { firstContentfulPaint: audits["first-contentful-paint"].numericValue } : {}),
      ...(typeof audits["largest-contentful-paint"]?.numericValue === "number" ? { largestContentfulPaint: audits["largest-contentful-paint"].numericValue } : {}),
      ...(typeof audits["cumulative-layout-shift"]?.numericValue === "number" ? { cumulativeLayoutShift: audits["cumulative-layout-shift"].numericValue } : {}),
      ...(typeof audits["total-blocking-time"]?.numericValue === "number" ? { totalBlockingTime: audits["total-blocking-time"].numericValue } : {})
    }
  };
  process.stdout.write(JSON.stringify(output));
} catch (error) {
  process.stdout.write(JSON.stringify({ status: "skipped", reason: "Lighthouse 不可用：" + (error instanceof Error ? error.message : String(error)) }));
} finally {
  try { chrome?.kill(); } catch {}
}
`;

export async function runLighthouse(baseUrl: string, enabled: boolean, signal?: AbortSignal, timeoutMs = 30_000): Promise<LighthouseResult> {
  if (!enabled) return { status: "skipped", reason: "用户关闭了 Lighthouse 检测" };
  const chromePath = await findBrowserExecutable();
  if (!chromePath) return { status: "skipped", reason: "未找到本地 Chrome 或 Edge" };
  const require = createRequire(import.meta.url);
  const isolated = await runIsolatedNode(LIGHTHOUSE_WORKER, timeoutMs, signal, {
    AGENTBENCH_CHROME_PATH: chromePath,
    AGENTBENCH_TARGET_URL: baseUrl,
    AGENTBENCH_CHROME_LAUNCHER_URL: pathToFileURL(require.resolve("chrome-launcher")).href,
    AGENTBENCH_LIGHTHOUSE_URL: pathToFileURL(require.resolve("lighthouse")).href
  });
  if (isolated.status === "timeout") return { status: "skipped", reason: `Lighthouse 超过 ${timeoutMs}ms，已终止独立检测进程` };
  if (isolated.status === "cancelled") return { status: "skipped", reason: "任务已中止，Lighthouse 独立进程已清理" };
  if (isolated.status === "failed") return { status: "skipped", reason: `Lighthouse 独立进程失败：${isolated.stderr.trim() || `退出码 ${isolated.exitCode ?? "unknown"}`}` };
  try {
    const parsed = JSON.parse(isolated.stdout.trim()) as LighthouseResult;
    if (parsed.status !== "completed" && parsed.status !== "skipped" && parsed.status !== "failed") throw new Error("无效状态");
    return parsed;
  } catch (error) {
    return { status: "skipped", reason: `Lighthouse 结果解析失败：${error instanceof Error ? error.message : String(error)}` };
  }
}
