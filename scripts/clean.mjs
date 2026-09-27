import { readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const safeTargets = [
  "apps/server/dist", "apps/web/dist", "apps/web/.vite", "packages/shared/dist",
  "fixtures/project-a/dist", "fixtures/project-b/dist", "coverage"
];
for (const relative of safeTargets) await rm(path.join(root, relative), { recursive: true, force: true });
const runsRoot = path.join(root, "data", "runs");
for (const entry of await readdir(runsRoot, { withFileTypes: true }).catch(() => [])) {
  if (entry.name !== ".gitkeep") await rm(path.join(runsRoot, entry.name), { recursive: true, force: true });
}
await writeFile(path.join(root, "data", "index.json"), "{\n  \"runIds\": []\n}\n", "utf8");
console.log("AgentBench build artifacts and temporary run data cleaned.");
