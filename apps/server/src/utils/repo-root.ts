import { access, readFile } from "node:fs/promises";
import path from "node:path";

export async function findRepoRoot(startDirectory = process.cwd()): Promise<string> {
  let current = path.resolve(startDirectory);
  while (true) {
    const packagePath = path.join(current, "package.json");
    try {
      await access(packagePath);
      const parsed = JSON.parse(await readFile(packagePath, "utf8")) as { name?: string };
      if (parsed.name === "agentbench-studio") return current;
    } catch {
      // Continue walking upward.
    }
    const parent = path.dirname(current);
    if (parent === current) throw new Error("无法定位 AgentBench Studio 仓库根目录");
    current = parent;
  }
}
