import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

export type ProcessExit = { code: number | null; signal: NodeJS.Signals | null };
export type ManagedProcess = {
  child: ChildProcess;
  pid?: number;
  exited: Promise<ProcessExit>;
  isExited: () => boolean;
};

type StartOptions = {
  cwd: string;
  logFile: string;
  signal: AbortSignal;
  onOutput: (level: "info" | "error", line: string) => void;
  environment?: NodeJS.ProcessEnv;
};

export class ProcessManager {
  private readonly processes = new Set<ManagedProcess>();

  async start(command: string, options: StartOptions): Promise<ManagedProcess> {
    if (options.signal.aborted) throw new Error("任务已由用户中止，未启动本地命令");
    await mkdir(path.dirname(options.logFile), { recursive: true });
    let didExit = false;
    const child = spawn(command, {
      cwd: options.cwd,
      shell: true,
      windowsHide: true,
      detached: process.platform !== "win32",
      env: { ...process.env, ...options.environment },
      stdio: ["ignore", "pipe", "pipe"]
    });
    const writeChunk = (level: "info" | "error", chunk: Buffer | string) => {
      const text = chunk.toString();
      void appendFile(options.logFile, text, "utf8");
      for (const line of text.split(/\r?\n/).filter(Boolean)) options.onOutput(level, line);
    };
    child.stdout?.on("data", (chunk: Buffer) => writeChunk("info", chunk));
    child.stderr?.on("data", (chunk: Buffer) => writeChunk("error", chunk));
    const exited = new Promise<ProcessExit>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        didExit = true;
        resolve({ code, signal });
      });
    });
    const managed: ManagedProcess = { child, ...(child.pid ? { pid: child.pid } : {}), exited, isExited: () => didExit };
    this.processes.add(managed);
    void exited.finally(() => this.processes.delete(managed)).catch(() => undefined);
    const abort = () => { void this.stop(managed); };
    options.signal.addEventListener("abort", abort, { once: true });
    void exited.finally(() => options.signal.removeEventListener("abort", abort)).catch(() => undefined);
    if (options.signal.aborted) {
      await this.stop(managed);
      throw new Error("任务已由用户中止，已清理刚启动的本地命令");
    }
    return managed;
  }

  async run(command: string, options: StartOptions): Promise<void> {
    const managed = await this.start(command, options);
    const result = await managed.exited;
    if (options.signal.aborted) throw new Error("任务已由用户中止");
    if (result.code !== 0) throw new Error(`命令执行失败（退出码 ${result.code ?? "unknown"}）：${command}`);
  }

  async stop(managed: ManagedProcess): Promise<void> {
    if (managed.isExited()) return;
    const pid = managed.pid;
    try {
      if (process.platform === "win32" && pid) {
        await new Promise<void>((resolve) => {
          const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, shell: false, stdio: "ignore" });
          killer.once("exit", () => resolve());
          killer.once("error", () => resolve());
        });
      } else if (pid) {
        try { process.kill(-pid, "SIGTERM"); } catch { managed.child.kill("SIGTERM"); }
      } else {
        managed.child.kill("SIGTERM");
      }
    } catch {
      // The process may already have exited.
    }
    await Promise.race([
      managed.exited.catch(() => ({ code: null, signal: null })),
      new Promise((resolve) => setTimeout(resolve, 2_000))
    ]);
    if (!managed.isExited() && process.platform !== "win32" && pid) {
      try { process.kill(-pid, "SIGKILL"); } catch { try { managed.child.kill("SIGKILL"); } catch { /* already exited */ } }
    }
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.processes].map((managed) => this.stop(managed)));
  }
}
