import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BenchmarkRun, BenchmarkRunInput, LighthouseResult } from "@agentbench/shared";
import { ProcessManager } from "../process/process-manager";
import { BenchmarkService } from "../runner/benchmark-service";
import { RunEventBus } from "../runner/events";
import { RunStorage } from "../storage/run-storage";

describe("browser startup failure cleanup", () => {
  let root: string;
  let service: BenchmarkService;
  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "agentbench-browser-fail-"));
    await writeFile(path.join(root, "package.json"), '{"name":"cleanup-fixture","type":"module"}', "utf8");
    await writeFile(path.join(root, "server.mjs"), "import http from 'node:http';http.createServer((_,r)=>r.end('ok')).listen(Number(process.env.PORT),'127.0.0.1');", "utf8");
    const storage = new RunStorage(path.join(root, "data"));
    await storage.initialize();
    service = new BenchmarkService(storage, new RunEventBus(), new ProcessManager(), {
      runBrowserTests: async () => { throw new Error("simulated browser launch failure"); },
      runLighthouse: async (): Promise<LighthouseResult> => ({ status: "skipped", reason: "not reached" })
    });
  });
  afterEach(async () => { await service.shutdown(); await rm(root, { recursive: true, force: true }); });

  it("stops both candidate processes immediately after browser launch failure", async () => {
    const input: BenchmarkRunInput = {
      name: "cleanup",
      projects: [
        { id: "project-a", name: "A", localPath: root, startCommand: "node server.mjs", port: 4193, baseUrl: "http://127.0.0.1:4193", startupTimeoutMs: 5_000 },
        { id: "project-b", name: "B", localPath: root, startCommand: "node server.mjs", port: 4194, baseUrl: "http://127.0.0.1:4194", startupTimeoutMs: 5_000 }
      ],
      requirements: [], testCases: [],
      settings: { runInstall: false, runLighthouse: false, runAxe: false, testMobile: false, includeAbsolutePaths: false, startupTimeoutMs: 5_000, stepTimeoutMs: 1_000 }
    };
    const created = await service.create(input);
    await service.start(created.id);
    let run: BenchmarkRun | null = null;
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      run = await service.storage.get(created.id);
      if (run && ["completed", "failed", "cancelled"].includes(run.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(run?.status).toBe("completed");
    expect(run?.results?.projectResults.every((project) => project.startup.error?.includes("simulated browser launch failure"))).toBe(true);
    for (const port of [4193, 4194]) expect(await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(300) }).then(() => true).catch(() => false)).toBe(false);
  }, 20_000);
});

