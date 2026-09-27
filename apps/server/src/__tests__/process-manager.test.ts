import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProcessManager } from "../process/process-manager";
import { waitForUrl } from "../runner/wait-for-url";

const availablePort = async (): Promise<number> => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    server.close(() => resolve(port));
  });
});

describe("ProcessManager lifecycle", () => {
  let directory: string;
  let manager: ProcessManager;
  beforeEach(async () => { directory = await mkdtemp(path.join(os.tmpdir(), "agentbench-process-")); manager = new ProcessManager(); });
  afterEach(async () => { await manager.stopAll(); await rm(directory, { recursive: true, force: true }); });

  const options = (signal: AbortSignal) => ({ cwd: directory, logFile: path.join(directory, "process.log"), signal, onOutput: () => undefined });

  it("records normal exit and output", async () => {
    const controller = new AbortController();
    const managed = await manager.start(`"${process.execPath}" -e "console.log('READY')"`, options(controller.signal));
    expect((await managed.exited).code).toBe(0);
    expect(await readFile(path.join(directory, "process.log"), "utf8")).toContain("READY");
  });

  it("cleans a process after startup timeout", async () => {
    const controller = new AbortController();
    const managed = await manager.start(`"${process.execPath}" -e "setInterval(()=>{},1000)"`, options(controller.signal));
    await expect(waitForUrl("http://127.0.0.1:1", 120, managed, controller.signal)).rejects.toThrow(/超时/);
    await manager.stop(managed);
    await expect(Promise.race([managed.exited, new Promise((_, reject) => setTimeout(() => reject(new Error("process remained alive")), 3_000))])).resolves.toBeTruthy();
  });

  it("cleans on user cancellation and backend shutdown", async () => {
    const controller = new AbortController();
    const managed = await manager.start(`"${process.execPath}" -e "setInterval(()=>{},1000)"`, options(controller.signal));
    controller.abort();
    await manager.stopAll();
    await expect(Promise.race([managed.exited, new Promise((_, reject) => setTimeout(() => reject(new Error("process remained alive")), 3_000))])).resolves.toBeTruthy();
  });

  it("never spawns a command when the signal was already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(manager.start(`"${process.execPath}" -e "setInterval(()=>{},1000)"`, options(controller.signal))).rejects.toThrow(/中止/);
  });

  it("terminates a spawned grandchild process tree", async () => {
    const port = await availablePort();
    await writeFile(path.join(directory, "child.mjs"), `import http from 'node:http';http.createServer((_,r)=>r.end('ok')).listen(${port},'127.0.0.1');`, "utf8");
    await writeFile(path.join(directory, "parent.mjs"), "import {spawn} from 'node:child_process';spawn(process.execPath,['child.mjs'],{cwd:process.cwd(),stdio:'ignore'});setInterval(()=>{},1000);", "utf8");
    const controller = new AbortController();
    const managed = await manager.start(`"${process.execPath}" parent.mjs`, options(controller.signal));
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline && !await fetch(`http://127.0.0.1:${port}`).then(() => true).catch(() => false)) await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await fetch(`http://127.0.0.1:${port}`).then(() => true).catch(() => false)).toBe(true);
    await manager.stop(managed);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(300) }).then(() => true).catch(() => false)).toBe(false);
  }, 10_000);
});
