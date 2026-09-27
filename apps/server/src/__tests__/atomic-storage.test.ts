import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeJsonAtomic } from "../storage/atomic";
import { RunStorage } from "../storage/run-storage";

describe("Windows-safe persistence", () => {
  let directory: string;
  beforeEach(async () => { directory = await mkdtemp(path.join(os.tmpdir(), "agentbench-atomic-")); });
  afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

  it("keeps JSON valid under rapid replacement and leaves no temp files", async () => {
    const target = path.join(directory, "state.json");
    await Promise.all(Array.from({ length: 40 }, (_, index) => writeJsonAtomic(target, { index, payload: "x".repeat(200) })));
    const parsed = JSON.parse(await readFile(target, "utf8")) as { index: number };
    expect(parsed.index).toBeGreaterThanOrEqual(0);
    expect((await readdir(directory)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("does not lose concurrent server log lines", async () => {
    const storage = new RunStorage(directory);
    await storage.initialize();
    await Promise.all(Array.from({ length: 30 }, (_, index) => storage.writeLog("run-1", "server.log", `LINE-${index}`)));
    const content = await readFile(path.join(directory, "runs", "run-1", "logs", "server.log"), "utf8");
    for (let index = 0; index < 30; index += 1) expect(content).toContain(`LINE-${index}\n`);
  });
});
