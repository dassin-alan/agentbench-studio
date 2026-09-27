import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { BenchmarkRun } from "@agentbench/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../apps/server/src/app";
import { getDemoRunInputWithAvailablePorts } from "../../apps/server/src/demo/config";

describe("built-in real benchmark", () => {
  const repoRoot = path.resolve(".");
  let dataRoot: string;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let completedRun: BenchmarkRun;

  beforeAll(async () => {
    dataRoot = await mkdtemp(path.join(os.tmpdir(), "agentbench-e2e-"));
    app = await buildApp({ dataRoot, repoRoot, installSignalHandlers: false });
  });

  afterAll(async () => {
    await app.close();
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("runs both projects, captures evidence, recommends Project A and writes three reports", async () => {
    const demo = await getDemoRunInputWithAvailablePorts(repoRoot);
    const created = await app.inject({ method: "POST", url: "/api/runs", payload: demo });
    expect(created.statusCode).toBe(201);
    const runId = created.json<{ id: string }>().id;
    const started = await app.inject({ method: "POST", url: `/api/runs/${runId}/start` });
    expect(started.statusCode).toBe(202);

    const deadline = Date.now() + 150_000;
    while (Date.now() < deadline) {
      const response = await app.inject({ method: "GET", url: `/api/runs/${runId}` });
      const run = response.json<BenchmarkRun>();
      if (["completed", "failed", "cancelled"].includes(run.status)) {
        completedRun = run;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    expect(completedRun?.status, completedRun?.error).toBe("completed");
    expect(completedRun.results?.decision.recommendedProjectId).toBe("project-a");
    const projectA = completedRun.results?.projectResults.find((project) => project.projectId === "project-a");
    const projectB = completedRun.results?.projectResults.find((project) => project.projectId === "project-b");
    expect(projectA?.testCases.filter((testCase) => testCase.critical).every((testCase) => testCase.status === "passed")).toBe(true);
    const projectBDiagnostic = JSON.stringify({
      status: projectB?.status,
      startup: projectB?.startup,
      testCases: projectB?.testCases.map((testCase) => ({ id: testCase.testCaseId, status: testCase.status }))
    });
    expect(projectB?.testCases.find((testCase) => testCase.testCaseId === "TEST-004")?.status, projectBDiagnostic).toBe("failed");
    expect(projectB?.browserLogs.some((log) => log.message.includes("detail module failed"))).toBe(true);
    expect(projectA?.artifacts.some((artifact) => artifact.type === "screenshot")).toBe(true);
    expect(["completed", "skipped"]).toContain(projectA?.lighthouse?.status);
    expect(projectA?.lighthouse?.status === "completed" ? projectA.lighthouse.categories?.performance : projectA?.lighthouse?.reason).toBeTruthy();

    const reports = path.join(dataRoot, "runs", runId, "reports");
    await Promise.all([access(path.join(reports, "report.html")), access(path.join(reports, "report.md")), access(path.join(reports, "report.json"))]);
    expect(await readFile(path.join(reports, "report.html"), "utf8")).toContain("data:image/png;base64,");
    expect(await readFile(path.join(reports, "report.md"), "utf8")).toContain("建议继续开发的基础版本");

    await new Promise((resolve) => setTimeout(resolve, 400));
    const portA = await fetch(demo.projects[0].baseUrl, { signal: AbortSignal.timeout(500) }).then(() => true).catch(() => false);
    const portB = await fetch(demo.projects[1].baseUrl, { signal: AbortSignal.timeout(500) }).then(() => true).catch(() => false);
    expect({ portA, portB }).toEqual({ portA: false, portB: false });
  });

  it("cancels an active run and cleans the child process tree", async () => {
    const demo = await getDemoRunInputWithAvailablePorts(repoRoot);
    const created = await app.inject({ method: "POST", url: "/api/runs", payload: demo });
    const runId = created.json<{ id: string }>().id;
    expect((await app.inject({ method: "POST", url: `/api/runs/${runId}/start` })).statusCode).toBe(202);
    const cancelled = await app.inject({ method: "POST", url: `/api/runs/${runId}/cancel` });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json<BenchmarkRun>().status).toBe("cancelled");
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect((await app.inject({ method: "GET", url: `/api/runs/${runId}` })).json<BenchmarkRun>().status).toBe("cancelled");
    const ports = await Promise.all(demo.projects.map((project) => fetch(project.baseUrl, { signal: AbortSignal.timeout(500) }).then(() => true).catch(() => false)));
    expect(ports).toEqual([false, false]);
  });
});
