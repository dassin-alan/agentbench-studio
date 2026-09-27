import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { BenchmarkRun, BenchmarkRunInput, LighthouseResult } from "@agentbench/shared";
import { failedProjectResult } from "../playwright/browser-runner";
import { ProcessManager } from "../process/process-manager";
import { BenchmarkService } from "../runner/benchmark-service";
import { RunEventBus } from "../runner/events";
import { RunStorage } from "../storage/run-storage";

describe("standalone HTML project runtime", () => {
  let temporaryRoot = "";
  let service: BenchmarkService | undefined;

  afterEach(async () => {
    await service?.shutdown();
    if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
  });

  it("serves HTML files through the built-in server and cleans both ports", async () => {
    temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "agentbench-html-"));
    const fileA = path.join(temporaryRoot, "project-a.html");
    const fileB = path.join(temporaryRoot, "project-b.html");
    await writeFile(fileA, "<!doctype html><title>A</title><main>single-a</main>", "utf8");
    await writeFile(fileB, "<!doctype html><title>B</title><main>single-b</main>", "utf8");
    const storage = new RunStorage(path.join(temporaryRoot, "data"));
    await storage.initialize();
    const servedPages: string[] = [];
    service = new BenchmarkService(storage, new RunEventBus(), new ProcessManager(), {
      repoRoot: path.resolve("."),
      runBrowserTests: async ({ project }) => {
        servedPages.push(await fetch(project.baseUrl).then((response) => response.text()));
        return failedProjectResult(project.id, "browser assertions replaced by runtime fixture", 0);
      },
      runLighthouse: async (): Promise<LighthouseResult> => ({ status: "skipped", reason: "unit integration" }),
    });
    const input: BenchmarkRunInput = {
      name: "single HTML comparison",
      projects: [
        { id: "project-a", name: "A", localPath: fileA, startCommand: "agentbench:serve-html", port: 4195, baseUrl: "http://127.0.0.1:4195", startupTimeoutMs: 5_000 },
        { id: "project-b", name: "B", localPath: fileB, startCommand: "agentbench:serve-html", port: 4196, baseUrl: "http://127.0.0.1:4196", startupTimeoutMs: 5_000 },
      ],
      requirements: [], testCases: [],
      settings: { runInstall: false, runLighthouse: false, runAxe: false, testMobile: false, includeAbsolutePaths: false, startupTimeoutMs: 5_000, stepTimeoutMs: 1_000 },
    };
    const created = await service.create(input);
    await service.start(created.id);
    let run: BenchmarkRun | null = null;
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      run = await storage.get(created.id);
      if (run && ["completed", "failed", "cancelled"].includes(run.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    expect(run?.status, run?.error).toBe("completed");
    expect(servedPages).toEqual([expect.stringContaining("single-a"), expect.stringContaining("single-b")]);
    await new Promise((resolve) => setTimeout(resolve, 300));
    for (const port of [4195, 4196]) {
      expect(await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(300) }).then(() => true).catch(() => false)).toBe(false);
    }
  }, 20_000);
});
