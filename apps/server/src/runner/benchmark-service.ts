import { access, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  BenchmarkRunInputSchema,
  buildRequirementMatrix,
  calculateProjectScore,
  decisionSummaryFromEvaluation,
  finalizeEvaluation,
  releaseAssessmentFromEvaluation,
  type BenchmarkRun,
  type BenchmarkRunInput,
  type ComparisonResult,
  type ProjectConfig,
  type ProjectId,
  type ProjectResult,
  type RunEvent
} from "@agentbench/shared";
import { ProcessManager, type ManagedProcess } from "../process/process-manager";
import { RunStorage } from "../storage/run-storage";
import { runBrowserTests, failedProjectResult } from "../playwright/browser-runner";
import { runLighthouse } from "../lighthouse/lighthouse-runner";
import { writeReports } from "../reports/report-generator";
import { RunEventBus } from "./events";
import { probeUrl, waitForUrl } from "./wait-for-url";

export class UserFacingError extends Error {
  constructor(message: string, readonly statusCode = 400) { super(message); }
}

type BenchmarkServiceDependencies = {
  runBrowserTests: typeof runBrowserTests;
  runLighthouse: typeof runLighthouse;
  repoRoot: string;
};

export class BenchmarkService {
  private activeRunId: string | null = null;
  private activeController: AbortController | null = null;
  private readonly browserRunner: typeof runBrowserTests;
  private readonly lighthouseRunner: typeof runLighthouse;
  private readonly repoRoot: string;

  constructor(
    readonly storage: RunStorage,
    readonly events: RunEventBus,
    private readonly processManager: ProcessManager,
    dependencies: Partial<BenchmarkServiceDependencies> = {}
  ) {
    this.browserRunner = dependencies.runBrowserTests ?? runBrowserTests;
    this.lighthouseRunner = dependencies.runLighthouse ?? runLighthouse;
    this.repoRoot = dependencies.repoRoot ?? process.cwd();
  }

  async create(input: unknown): Promise<BenchmarkRun> {
    const parsed = BenchmarkRunInputSchema.parse(input) as BenchmarkRunInput;
    const run: BenchmarkRun = {
      ...parsed,
      id: randomUUID(),
      status: "draft",
      createdAt: new Date().toISOString(),
      progress: { stage: "draft", completed: 0, total: 12 }
    };
    return this.storage.create(run);
  }

  async updateDraft(runId: string, input: unknown): Promise<BenchmarkRun> {
    const current = await this.requireRun(runId);
    if (current.status !== "draft") throw new UserFacingError("只有草稿评测可以修改", 409);
    const parsed = BenchmarkRunInputSchema.parse(input) as BenchmarkRunInput;
    const updated: BenchmarkRun = { ...parsed, id: current.id, status: current.status, createdAt: current.createdAt, progress: current.progress };
    await this.storage.save(updated);
    return updated;
  }

  async remove(runId: string): Promise<void> {
    const run = await this.requireRun(runId);
    if (run.status === "running" || run.status === "queued") throw new UserFacingError("运行中的评测不能删除，请先中止任务", 409);
    await this.storage.remove(runId);
  }

  async start(runId: string): Promise<BenchmarkRun> {
    const run = await this.requireRun(runId);
    if (this.activeRunId) throw new UserFacingError(`已有评测 ${this.activeRunId} 正在运行；第一版同时只允许一个任务`, 409);
    if (run.status !== "draft" && run.status !== "failed" && run.status !== "cancelled") throw new UserFacingError(`当前状态 ${run.status} 不允许开始评测`, 409);
    await this.validateRunnable(run);
    const controller = new AbortController();
    this.activeRunId = runId;
    this.activeController = controller;
    const queued: BenchmarkRun = { ...run, status: "queued", startedAt: new Date().toISOString(), progress: { stage: "queued", completed: 0, total: 12, message: "等待执行" } };
    await this.storage.save(queued);
    setImmediate(() => { void this.execute(queued, controller); });
    return queued;
  }

  async cancel(runId: string): Promise<BenchmarkRun> {
    const run = await this.requireRun(runId);
    if (this.activeRunId !== runId || (run.status !== "queued" && run.status !== "running")) throw new UserFacingError("该评测当前不在运行中，无法中止", 409);
    this.activeController?.abort();
    await this.processManager.stopAll();
    const cancelled: BenchmarkRun = { ...run, status: "cancelled", completedAt: new Date().toISOString(), progress: { ...run.progress, stage: "cancelled", message: "用户已中止任务" }, error: "任务已由用户中止" };
    await this.storage.save(cancelled);
    this.events.emit(runId, { type: "cancelled" });
    return cancelled;
  }

  async shutdown(): Promise<void> {
    this.activeController?.abort();
    await this.processManager.stopAll();
  }

  private async execute(initial: BenchmarkRun, controller: AbortController): Promise<void> {
    let run: BenchmarkRun = { ...initial, status: "running", progress: { stage: "environment", completed: 1, total: 12, message: "验证运行环境" } };
    try {
      if (controller.signal.aborted) throw new Error("任务已由用户中止，未启动候选项目");
      await this.storage.save(run);
      this.emit(run.id, { type: "stage", stage: "environment" });
      const projectResults: ProjectResult[] = [];
      for (let index = 0; index < run.projects.length; index += 1) {
        const project = run.projects[index];
        if (!project) continue;
        const completed = 2 + index * 4;
        run = await this.updateProgress(run, { stage: "startup", completed, total: 12, projectId: project.id, message: `启动 ${project.name}` });
        const result = await this.executeProject(run, project, controller.signal);
        projectResults.push(result);
        run = await this.updateProgress(run, { stage: "project-complete", completed: completed + 4, total: 12, projectId: project.id, message: `${project.name} 测试完成` });
      }
      if (controller.signal.aborted) throw new Error("任务已由用户中止");
      const normalized: [ProjectResult, ProjectResult] = [
        projectResults.find((result) => result.projectId === "project-a") ?? failedProjectResult("project-a", "Project A 未生成结果", 0),
        projectResults.find((result) => result.projectId === "project-b") ?? failedProjectResult("project-b", "Project B 未生成结果", 0)
      ];
      run = await this.updateProgress(run, { stage: "scoring", completed: 10, total: 12, message: "生成需求矩阵和固定评分" });
      const matrix = buildRequirementMatrix(run.requirements, run.testCases, normalized);
      const scores = {
        "project-a": calculateProjectScore(normalized[0], matrix, "project-a"),
        "project-b": calculateProjectScore(normalized[1], matrix, "project-b")
      };
      const names: Record<ProjectId, string> = { "project-a": run.projects[0].name, "project-b": run.projects[1].name };
      const evaluation = finalizeEvaluation({ projectResults: normalized, scores, requirementMatrix: matrix, requirements: run.requirements, testCases: run.testCases, projectNames: names });
      const results: ComparisonResult = { projectResults: normalized, requirementMatrix: matrix, scores, evaluation, decision: decisionSummaryFromEvaluation(evaluation), assessment: releaseAssessmentFromEvaluation(evaluation), generatedAt: new Date().toISOString() };
      run = { ...run, results, progress: { stage: "reports", completed: 11, total: 12, message: "生成 HTML、Markdown 和 JSON 报告" } };
      await this.storage.save(run);
      await writeReports(this.storage, run);
      run = { ...run, status: "completed", completedAt: new Date().toISOString(), progress: { stage: "completed", completed: 12, total: 12, message: "评测完成" } };
      await this.storage.save(run);
      this.emit(run.id, { type: "result", result: results });
      this.emit(run.id, { type: "completed" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const latest = await this.storage.get(initial.id) ?? run;
      if (controller.signal.aborted || latest.status === "cancelled") {
        if (latest.status !== "cancelled") {
          const cancelled: BenchmarkRun = { ...latest, status: "cancelled", completedAt: new Date().toISOString(), progress: { ...latest.progress, stage: "cancelled", message }, error: message };
          await this.storage.save(cancelled);
          this.emit(initial.id, { type: "cancelled" });
        }
      } else {
        const failed: BenchmarkRun = { ...latest, status: "failed", completedAt: new Date().toISOString(), progress: { ...latest.progress, stage: "failed", message }, error: message };
        await this.storage.save(failed);
        this.emit(initial.id, { type: "error", message });
      }
    } finally {
      await this.processManager.stopAll();
      if (this.activeRunId === initial.id) {
        this.activeRunId = null;
        this.activeController = null;
      }
    }
  }

  private async executeProject(run: BenchmarkRun, project: ProjectConfig, signal: AbortSignal): Promise<ProjectResult> {
    const projectStarted = Date.now();
    const projectDetails = await stat(project.localPath);
    const isStandaloneHtml = projectDetails.isFile() && [".html", ".htm"].includes(path.extname(project.localPath).toLowerCase());
    const workingDirectory = isStandaloneHtml ? path.dirname(project.localPath) : path.resolve(project.localPath, project.workingDirectory ?? ".");
    const staticServerScript = path.join(this.repoRoot, "apps", "server", "scripts", "static-html-server.mjs");
    const startCommand = isStandaloneHtml ? `${quoteShellArgument(process.execPath)} ${quoteShellArgument(staticServerScript)}` : project.startCommand;
    const logFile = path.join(this.storage.runDirectory(run.id), "logs", `${project.id}.log`);
    const onOutput = (level: "info" | "error", line: string) => this.log(run.id, project.id, level === "error" ? "error" : "info", line);
    let handle: ManagedProcess | undefined;
    try {
      if (run.settings.runInstall && project.installCommand && !isStandaloneHtml) {
        this.log(run.id, project.id, "info", `执行安装命令：${project.installCommand}`);
        await this.processManager.run(project.installCommand, { cwd: workingDirectory, logFile, signal, onOutput });
      }
      const occupied = await probeUrl(project.baseUrl, 600);
      if (occupied) throw new Error(`地址 ${project.baseUrl} 已被占用；请释放端口 ${project.port} 或修改配置`);
      if (isStandaloneHtml && run.settings.runInstall && project.installCommand) this.log(run.id, project.id, "warning", "单文件 HTML 不执行安装命令，已使用内置静态服务器");
      this.log(run.id, project.id, "info", isStandaloneHtml ? "启动 AgentBench 内置单文件静态服务器" : `执行启动命令：${startCommand}`);
      handle = await this.processManager.start(startCommand, { cwd: workingDirectory, logFile, signal, onOutput, environment: { PORT: String(project.port), ...(isStandaloneHtml ? { AGENTBENCH_HTML_FILE: project.localPath } : {}) } });
      await waitForUrl(project.baseUrl, project.startupTimeoutMs || run.settings.startupTimeoutMs, handle, signal);
      const startup = { status: "passed" as const, durationMs: Date.now() - projectStarted, ...(handle.pid ? { pid: handle.pid } : {}) };
      this.emit(run.id, { type: "stage", stage: "playwright", projectId: project.id });
      let result = await this.browserRunner({
        runId: run.id,
        runDirectory: this.storage.runDirectory(run.id),
        project,
        startup,
        testCases: run.testCases,
        settings: run.settings,
        signal,
        onLog: (level, message) => this.log(run.id, project.id, level, message),
        onArtifact: (artifact) => this.emit(run.id, { type: "artifact", artifact })
      });
      this.emit(run.id, { type: "stage", stage: "lighthouse", projectId: project.id });
      const lighthouse = await this.lighthouseRunner(project.baseUrl, run.settings.runLighthouse, signal);
      result = { ...result, lighthouse };
      return result;
    } catch (error) {
      if (signal.aborted) throw error;
      const message = error instanceof Error ? error.message : String(error);
      this.log(run.id, project.id, "error", message);
      return failedProjectResult(project.id, message, Date.now() - projectStarted);
    } finally {
      if (handle) await this.processManager.stop(handle);
    }
  }

  private async validateRunnable(run: BenchmarkRun): Promise<void> {
    for (const project of run.projects) {
      let details;
      try { details = await stat(project.localPath); } catch { throw new UserFacingError(`${project.name} 的项目路径不存在：${project.localPath}`); }
      if (details.isFile()) {
        if (![".html", ".htm"].includes(path.extname(project.localPath).toLowerCase())) throw new UserFacingError(`${project.name} 的路径不是支持的 HTML 文件：${project.localPath}`);
        try { await access(path.join(this.repoRoot, "apps", "server", "scripts", "static-html-server.mjs")); } catch { throw new UserFacingError("AgentBench 内置单文件服务器缺失，请重新安装发布包"); }
        continue;
      }
      if (!details.isDirectory()) throw new UserFacingError(`${project.name} 的路径既不是项目目录，也不是支持的 HTML 文件：${project.localPath}`);
      if (!project.startCommand.trim()) throw new UserFacingError(`${project.name} 的启动命令为空`);
      const workingDirectory = path.resolve(project.localPath, project.workingDirectory ?? ".");
      try { if (!(await stat(workingDirectory)).isDirectory()) throw new Error(); } catch { throw new UserFacingError(`${project.name} 的工作目录不存在：${workingDirectory}`); }
      try { await access(path.join(project.localPath, "package.json")); } catch { this.log(run.id, project.id, "warning", `${project.name} 未找到 package.json；将按手动启动命令继续`); }
    }
  }

  private async updateProgress(run: BenchmarkRun, progress: BenchmarkRun["progress"]): Promise<BenchmarkRun> {
    const updated = { ...run, progress };
    await this.storage.save(updated);
    this.emit(run.id, { type: "stage", stage: progress.stage, ...(progress.projectId ? { projectId: progress.projectId } : {}) });
    this.emit(run.id, { type: "progress", completed: progress.completed, total: progress.total });
    return updated;
  }

  private emit(runId: string, event: RunEvent): void { this.events.emit(runId, event); }

  private log(runId: string, projectId: ProjectId, level: "info" | "warning" | "error", message: string): void {
    const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${projectId}] ${message}`;
    void this.storage.writeLog(runId, "server.log", line).catch(() => undefined);
    this.emit(runId, { type: "log", level, message, projectId });
  }

  private async requireRun(runId: string): Promise<BenchmarkRun> {
    const run = await this.storage.get(runId);
    if (!run) throw new UserFacingError(`评测 ${runId} 不存在`, 404);
    return run;
  }
}

function quoteShellArgument(value: string): string {
  return process.platform === "win32" ? `"${value.replaceAll('"', '""')}"` : `'${value.replaceAll("'", "'\\''")}'`;
}
