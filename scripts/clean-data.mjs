import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = path.join(root, "data");
const runsRoot = path.join(dataRoot, "runs");

await rm(runsRoot, { recursive: true, force: true });
await rm(path.join(dataRoot, "ui-smoke"), { recursive: true, force: true });
await rm(path.join(dataRoot, "index.json"), { force: true });
for (const entry of await readdir(dataRoot)) {
  if (entry.endsWith(".log")) {
    await rm(path.join(dataRoot, entry), { force: true });
  }
}
await mkdir(runsRoot, { recursive: true });
await writeFile(path.join(runsRoot, ".gitkeep"), "", "utf8");
console.log(`已清理 ${runsRoot}；data/demo 已保留。`);
