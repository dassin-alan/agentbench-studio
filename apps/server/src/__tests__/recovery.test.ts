import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RunStorage } from "../storage/run-storage";
import { getDemoRunInput } from "../demo/config";

describe("server restart recovery", () => {
  let directory: string;
  beforeEach(async () => { directory = await mkdtemp(path.join(os.tmpdir(), "agentbench-recovery-")); });
  afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

  it("marks persisted running tasks as failed instead of pretending they are still active", async () => {
    const storage = new RunStorage(directory);
    await storage.initialize();
    await storage.create({ ...getDemoRunInput(path.resolve(".")), id: "run-restart", status: "running", createdAt: new Date().toISOString(), startedAt: new Date().toISOString(), progress: { stage: "playwright", completed: 4, total: 12 } });
    expect(await storage.recoverInterruptedRuns()).toBe(1);
    const recovered = await storage.get("run-restart");
    expect(recovered?.status).toBe("failed");
    expect(recovered?.error).toMatch(/后端服务重启/);
  });
});
