import type { ManagedProcess } from "../process/process-manager";

const delay = (durationMs: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, durationMs);
  signal.addEventListener("abort", () => {
    clearTimeout(timer);
    reject(new Error("任务已由用户中止"));
  }, { once: true });
});

export async function probeUrl(url: string, timeoutMs = 1_500): Promise<Response | null> {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "manual" });
  } catch {
    return null;
  }
}

export async function waitForUrl(url: string, timeoutMs: number, processHandle: ManagedProcess, signal: AbortSignal): Promise<Response> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (signal.aborted) throw new Error("任务已由用户中止");
    if (processHandle.isExited()) {
      const exit = await processHandle.exited;
      throw new Error(`项目进程在页面可访问前退出（退出码 ${exit.code ?? "unknown"}）`);
    }
    const response = await probeUrl(url, 1_500);
    if (response) return response;
    await delay(350, signal);
  }
  throw new Error(`等待 ${url} 超时（${timeoutMs}ms），请检查端口、baseUrl 和启动命令`);
}
