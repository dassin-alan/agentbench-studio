import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { RunStorage } from "./storage/run-storage";
import { RunEventBus } from "./runner/events";
import { ProcessManager } from "./process/process-manager";
import { BenchmarkService } from "./runner/benchmark-service";
import { registerRoutes } from "./api/routes";
import { findRepoRoot } from "./utils/repo-root";

export type AppOptions = { dataRoot?: string; repoRoot?: string; installSignalHandlers?: boolean; serveWeb?: boolean };

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const repoRoot = options.repoRoot ?? await findRepoRoot();
  const dataRoot = options.dataRoot ?? path.join(repoRoot, "data");
  const app = Fastify({ logger: false, bodyLimit: 2 * 1024 * 1024 });
  await app.register(cors, { origin: ["http://127.0.0.1:3000", "http://localhost:3000"] });
  const storage = new RunStorage(dataRoot);
  await storage.initialize();
  await storage.recoverInterruptedRuns();
  const events = new RunEventBus();
  const processes = new ProcessManager();
  const service = new BenchmarkService(storage, events, processes, { repoRoot });
  await registerRoutes(app, { service, storage, events, repoRoot });
  if (options.serveWeb) {
    await app.register(fastifyStatic, { root: path.join(repoRoot, "apps", "web", "dist"), prefix: "/" });
    app.setNotFoundHandler((request, reply) => request.url.startsWith("/api/")
      ? reply.code(404).send({ message: "API 接口不存在" })
      : reply.type("text/html; charset=utf-8").sendFile("index.html"));
  }
  app.addHook("onClose", async () => service.shutdown());

  if (options.installSignalHandlers !== false) {
    const shutdown = () => { void app.close().finally(() => process.exit(0)); };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    process.once("uncaughtException", (error) => { app.log.error(error); void app.close().finally(() => process.exit(1)); });
  }
  return app;
}
