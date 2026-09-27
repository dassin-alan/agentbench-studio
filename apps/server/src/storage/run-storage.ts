import { access, appendFile, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { BenchmarkRunSchema, type BenchmarkRun, type BenchmarkRunInput, type ComparisonResult } from "@agentbench/shared";
import { writeJsonAtomic, writeTextAtomic } from "./atomic";

type RunIndex = { runIds: string[] };

export class RunStorage {
  readonly runsRoot: string;
  private readonly indexPath: string;

  constructor(readonly dataRoot: string) {
    this.runsRoot = path.join(dataRoot, "runs");
    this.indexPath = path.join(dataRoot, "index.json");
  }

  async initialize(): Promise<void> {
    await mkdir(this.runsRoot, { recursive: true });
    try {
      await access(this.indexPath);
    } catch {
      await writeJsonAtomic(this.indexPath, { runIds: [] });
    }
  }

  runDirectory(runId: string): string {
    return path.join(this.runsRoot, runId);
  }

  async create(run: BenchmarkRun): Promise<BenchmarkRun> {
    const directory = this.runDirectory(run.id);
    await Promise.all([
      mkdir(path.join(directory, "logs"), { recursive: true }),
      mkdir(path.join(directory, "artifacts", "project-a", "screenshots"), { recursive: true }),
      mkdir(path.join(directory, "artifacts", "project-b", "screenshots"), { recursive: true }),
      mkdir(path.join(directory, "reports"), { recursive: true })
    ]);
    await writeJsonAtomic(path.join(directory, "config.json"), this.toInput(run));
    await this.save(run);
    const index = await this.readIndex();
    if (!index.runIds.includes(run.id)) {
      index.runIds.unshift(run.id);
      await writeJsonAtomic(this.indexPath, index);
    }
    return run;
  }

  async save(run: BenchmarkRun): Promise<void> {
    const directory = this.runDirectory(run.id);
    await writeJsonAtomic(path.join(directory, "state.json"), run);
    if (run.results) await this.saveResults(run.id, run.results);
  }

  async saveResults(runId: string, result: ComparisonResult): Promise<void> {
    const directory = this.runDirectory(runId);
    await Promise.all([
      writeJsonAtomic(path.join(directory, "result.json"), result),
      writeJsonAtomic(path.join(directory, "score.json"), result.scores),
      writeJsonAtomic(path.join(directory, "requirement-matrix.json"), result.requirementMatrix)
    ]);
  }

  async get(runId: string): Promise<BenchmarkRun | null> {
    try {
      const raw = JSON.parse(await readFile(path.join(this.runDirectory(runId), "state.json"), "utf8")) as unknown;
      return BenchmarkRunSchema.parse(raw) as BenchmarkRun;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return null;
      throw error;
    }
  }

  async list(): Promise<BenchmarkRun[]> {
    const index = await this.readIndex();
    const runs = await Promise.all(index.runIds.map((id) => this.get(id)));
    return runs.filter((run): run is BenchmarkRun => run !== null).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async recoverInterruptedRuns(): Promise<number> {
    const interrupted = (await this.list()).filter((run) => run.status === "running" || run.status === "queued");
    const message = "后端服务重启，原运行进程已无法恢复；请检查项目端口后重新开始评测";
    await Promise.all(interrupted.map((run) => this.save({
      ...run,
      status: "failed",
      completedAt: new Date().toISOString(),
      progress: { ...run.progress, stage: "failed", message },
      error: message
    })));
    return interrupted.length;
  }

  async remove(runId: string): Promise<void> {
    await rm(this.runDirectory(runId), { recursive: true, force: true });
    const index = await this.readIndex();
    index.runIds = index.runIds.filter((id) => id !== runId);
    await writeJsonAtomic(this.indexPath, index);
  }

  async writeLog(runId: string, fileName: string, line: string): Promise<void> {
    const filePath = path.join(this.runDirectory(runId), "logs", fileName);
    await mkdir(path.dirname(filePath), { recursive: true });
    await appendFile(filePath, line.endsWith("\n") ? line : `${line}\n`, "utf8");
  }

  async writeReport(runId: string, fileName: string, content: string): Promise<string> {
    const filePath = path.join(this.runDirectory(runId), "reports", fileName);
    await writeTextAtomic(filePath, content);
    return filePath;
  }

  private async readIndex(): Promise<RunIndex> {
    try {
      const raw = JSON.parse(await readFile(this.indexPath, "utf8")) as Partial<RunIndex>;
      return { runIds: Array.isArray(raw.runIds) ? raw.runIds.filter((id): id is string => typeof id === "string") : [] };
    } catch {
      return { runIds: [] };
    }
  }

  private toInput(run: BenchmarkRun): BenchmarkRunInput {
    const input: BenchmarkRunInput = {
      name: run.name,
      projects: run.projects,
      requirements: run.requirements,
      testCases: run.testCases,
      settings: run.settings
    };
    if (run.description) input.description = run.description;
    return input;
  }
}
