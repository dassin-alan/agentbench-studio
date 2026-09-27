import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app";
import { getDemoRunInput } from "../demo/config";

describe("runs API", () => {
  let dataRoot: string;
  let app: FastifyInstance;
  const repoRoot = path.resolve(".");

  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(os.tmpdir(), "agentbench-api-"));
    app = await buildApp({ dataRoot, repoRoot, installSignalHandlers: false });
  });

  afterEach(async () => {
    await app.close();
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("creates, retrieves and deletes a draft run", async () => {
    const created = await app.inject({ method: "POST", url: "/api/runs", payload: getDemoRunInput(repoRoot) });
    expect(created.statusCode).toBe(201);
    const run = created.json<{ id: string; status: string }>();
    expect(run.status).toBe("draft");

    const fetched = await app.inject({ method: "GET", url: `/api/runs/${run.id}` });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json<{ name: string }>().name).toContain("内置示例");

    const deleted = await app.inject({ method: "DELETE", url: `/api/runs/${run.id}` });
    expect(deleted.statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: `/api/runs/${run.id}` })).statusCode).toBe(404);
  });

  it("rejects starting a run whose project path does not exist", async () => {
    const input = getDemoRunInput(repoRoot);
    input.projects[0].localPath = path.join(repoRoot, "fixtures", "missing-project");
    const created = await app.inject({ method: "POST", url: "/api/runs", payload: input });
    const run = created.json<{ id: string }>();

    const started = await app.inject({ method: "POST", url: `/api/runs/${run.id}/start` });

    expect(started.statusCode).toBe(400);
    expect(started.json<{ message: string }>().message).toMatch(/不存在/);
  });

  it("returns a clear conflict for cancelling a non-running run", async () => {
    const created = await app.inject({ method: "POST", url: "/api/runs", payload: getDemoRunInput(repoRoot) });
    const run = created.json<{ id: string }>();

    const cancelled = await app.inject({ method: "POST", url: `/api/runs/${run.id}/cancel` });

    expect(cancelled.statusCode).toBe(409);
    expect(cancelled.json<{ message: string }>().message).toMatch(/运行中/);
  });

  it("does not fabricate reports for unfinished runs", async () => {
    const created = await app.inject({ method: "POST", url: "/api/runs", payload: getDemoRunInput(repoRoot) });
    const run = created.json<{ id: string }>();
    const report = await app.inject({ method: "GET", url: `/api/runs/${run.id}/report` });
    expect(report.statusCode).toBe(409);
    expect(report.json<{ message: string }>().message).toMatch(/尚未完成/);
  });

  it("blocks artifact directory traversal", async () => {
    const created = await app.inject({ method: "POST", url: "/api/runs", payload: getDemoRunInput(repoRoot) });
    const run = created.json<{ id: string }>();
    const response = await app.inject({ method: "GET", url: `/api/runs/${run.id}/artifacts/%252e%252e%252fconfig.json` });
    expect([400, 404]).toContain(response.statusCode);
    expect(response.statusCode).not.toBe(200);
  });
});
