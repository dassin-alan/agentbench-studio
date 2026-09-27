import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance, FastifyReply } from "fastify";
import { BenchmarkRunInputSchema, ProjectDetectionRequestSchema, RunIdParamsSchema } from "@agentbench/shared";
import type { BenchmarkService } from "../runner/benchmark-service";
import { UserFacingError } from "../runner/benchmark-service";
import type { RunStorage } from "../storage/run-storage";
import type { RunEventBus } from "../runner/events";
import { safeResolve } from "../utils/path-security";
import { detectProject } from "../runner/project-detection";
import { getDemoRunInputWithAvailablePorts } from "../demo/config";
import { reportFileName } from "../reports/report-generator";

type RouteDependencies = { service: BenchmarkService; storage: RunStorage; events: RunEventBus; repoRoot: string };

const sendError = (reply: FastifyReply, error: unknown) => {
  if (error instanceof UserFacingError) return reply.code(error.statusCode).send({ message: error.message });
  const message = error instanceof Error ? error.message : String(error);
  return reply.code(400).send({ message });
};

export async function registerRoutes(app: FastifyInstance, dependencies: RouteDependencies): Promise<void> {
  const { service, storage, events, repoRoot } = dependencies;
  app.get("/api/health", async () => ({ ok: true, service: "AgentBench Studio", timestamp: new Date().toISOString() }));
  app.get("/api/demo/config", async () => getDemoRunInputWithAvailablePorts(repoRoot));
  app.post("/api/projects/detect", async (request, reply) => {
    const parsed = ProjectDetectionRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: parsed.error.issues.map((issue) => issue.message).join("；") });
    return detectProject(parsed.data.path);
  });
  app.get("/api/runs", async () => storage.list());
  app.get("/api/runs/:id", async (request, reply) => {
    const parsed = RunIdParamsSchema.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ message: "无效评测 ID" });
    const run = await storage.get(parsed.data.id);
    return run ?? reply.code(404).send({ message: `评测 ${parsed.data.id} 不存在` });
  });
  app.post("/api/runs", async (request, reply) => {
    const parsed = BenchmarkRunInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("；") });
    try { return reply.code(201).send(await service.create(parsed.data)); } catch (error) { return sendError(reply, error); }
  });
  app.put("/api/runs/:id", async (request, reply) => {
    const params = RunIdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "无效评测 ID" });
    try { return await service.updateDraft(params.data.id, request.body); } catch (error) { return sendError(reply, error); }
  });
  app.delete("/api/runs/:id", async (request, reply) => {
    const params = RunIdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "无效评测 ID" });
    try { await service.remove(params.data.id); return reply.code(204).send(); } catch (error) { return sendError(reply, error); }
  });
  app.post("/api/runs/:id/start", async (request, reply) => {
    const params = RunIdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "无效评测 ID" });
    try { return reply.code(202).send(await service.start(params.data.id)); } catch (error) { return sendError(reply, error); }
  });
  app.post("/api/runs/:id/cancel", async (request, reply) => {
    const params = RunIdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "无效评测 ID" });
    try { return await service.cancel(params.data.id); } catch (error) { return sendError(reply, error); }
  });
  app.get("/api/runs/:id/report", async (request, reply) => {
    const params = RunIdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "无效评测 ID" });
    const run = await storage.get(params.data.id);
    if (!run) return reply.code(404).send({ message: "评测不存在" });
    if (run.status !== "completed" || !run.results) return reply.code(409).send({ message: "评测尚未完成，报告不可用" });
    return { runId: run.id, generatedAt: run.results.generatedAt, evaluation: run.results.evaluation, decision: run.results.decision, exports: { html: `/api/runs/${run.id}/export/html`, markdown: `/api/runs/${run.id}/export/markdown`, json: `/api/runs/${run.id}/export/json` } };
  });
  app.get("/api/runs/:id/export/:format", async (request, reply) => {
    const params = request.params as { id?: string; format?: string };
    if (!params.id || !["html", "markdown", "json"].includes(params.format ?? "")) return reply.code(400).send({ message: "无效导出格式" });
    const run = await storage.get(params.id);
    if (!run) return reply.code(404).send({ message: "评测不存在" });
    if (run.status !== "completed") return reply.code(409).send({ message: "评测尚未完成，无法导出" });
    const format = params.format as "html" | "markdown" | "json";
    const fileName = reportFileName(format);
    try {
      const content = await readFile(path.join(storage.runDirectory(run.id), "reports", fileName));
      const contentType = format === "html" ? "text/html; charset=utf-8" : format === "markdown" ? "text/markdown; charset=utf-8" : "application/json; charset=utf-8";
      return reply.header("Content-Type", contentType).header("Content-Disposition", `attachment; filename=agentbench-${run.id}.${format === "markdown" ? "md" : format}`).send(content);
    } catch (error) { return sendError(reply, new UserFacingError(`报告文件读取失败：${error instanceof Error ? error.message : String(error)}`, 500)); }
  });
  app.get("/api/runs/:id/artifacts/*", async (request, reply) => {
    const params = request.params as { id?: string; "*"?: string };
    if (!params.id || !params["*"]) return reply.code(400).send({ message: "证据路径为空" });
    const run = await storage.get(params.id);
    if (!run) return reply.code(404).send({ message: "评测不存在" });
    try {
      const filePath = safeResolve(path.join(storage.runDirectory(run.id), "artifacts"), params["*"]);
      if (!(await stat(filePath)).isFile()) return reply.code(404).send({ message: "证据文件不存在" });
      const file = await readFile(filePath);
      const extension = path.extname(filePath).toLowerCase();
      const contentType = extension === ".png" ? "image/png" : extension === ".json" ? "application/json" : "text/plain; charset=utf-8";
      return reply.header("Content-Type", contentType).header("Content-Disposition", `inline; filename="${path.basename(filePath)}"`).send(file);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(message.toLowerCase().includes("traversal") ? 400 : 404).send({ message });
    }
  });
  app.get("/api/runs/:id/events", async (request, reply) => {
    const params = RunIdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "无效评测 ID" });
    const run = await storage.get(params.data.id);
    if (!run) return reply.code(404).send({ message: "评测不存在" });
    reply.hijack();
    reply.raw.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    const send = (event: unknown) => reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    send({ type: "stage", stage: run.progress.stage, ...(run.progress.projectId ? { projectId: run.progress.projectId } : {}) });
    send({ type: "progress", completed: run.progress.completed, total: run.progress.total });
    if (run.status === "completed") send({ type: "completed" });
    if (run.status === "cancelled") send({ type: "cancelled" });
    const unsubscribe = events.subscribe(run.id, send);
    const heartbeat = setInterval(() => reply.raw.write(": heartbeat\n\n"), 15_000);
    request.raw.on("close", () => { clearInterval(heartbeat); unsubscribe(); });
  });
}
