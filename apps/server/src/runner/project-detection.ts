import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { normalizeLocalPathInput, type ProjectDetectionResult } from "@agentbench/shared";

export async function detectProject(localPath: string): Promise<ProjectDetectionResult> {
  const resolved = path.resolve(normalizeLocalPathInput(localPath));
  try {
    const details = await stat(resolved);
    if (!details.isDirectory()) {
      const extension = path.extname(resolved).toLowerCase();
      if (details.isFile() && [".html", ".htm"].includes(extension)) {
        return { exists: true, hasPackageJson: false, framework: "static", availableScripts: ["agentbench:serve-html"], suggestedStartCommand: "agentbench:serve-html", possiblePort: 4173 };
      }
      const error = extension === ".zip"
        ? "检测到 ZIP 文件；请先解压，然后填写包含 package.json（或静态页面文件）的项目目录"
        : "路径指向不支持的文件；请选择项目文件夹或单个 .html 文件";
      return { exists: true, hasPackageJson: false, availableScripts: [], error };
    }
  } catch {
    return { exists: false, hasPackageJson: false, availableScripts: [], error: "项目路径不存在" };
  }
  const packagePath = path.join(resolved, "package.json");
  try {
    await access(packagePath);
  } catch {
    return { exists: true, hasPackageJson: false, framework: "static", availableScripts: [], error: "package.json 不存在；仅可按静态项目手动配置启动命令" };
  }
  try {
    const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as { scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
    const availableScripts = Object.keys(packageJson.scripts ?? {});
    const packageManager = await determinePackageManager(resolved);
    let framework: ProjectDetectionResult["framework"] = "unknown";
    if (dependencies.next) framework = "next";
    else if (dependencies.vite && dependencies.vue) framework = "vue";
    else if (dependencies.vite) framework = "vite";
    else if (dependencies.react) framework = "react";
    const startScript = availableScripts.includes("dev") ? "dev" : availableScripts.includes("start") ? "start" : availableScripts[0];
    return {
      exists: true,
      hasPackageJson: true,
      packageManager,
      framework,
      availableScripts,
      suggestedInstallCommand: `${packageManager} install`,
      ...(startScript ? { suggestedStartCommand: `${packageManager} run ${startScript}` } : {}),
      possiblePort: framework === "next" ? 3000 : 5173
    };
  } catch (error) {
    return { exists: true, hasPackageJson: true, framework: "unknown", availableScripts: [], error: `package.json 解析失败：${error instanceof Error ? error.message : String(error)}` };
  }
}

async function determinePackageManager(directory: string): Promise<"npm" | "pnpm" | "yarn"> {
  for (const [file, manager] of [["pnpm-lock.yaml", "pnpm"], ["yarn.lock", "yarn"], ["package-lock.json", "npm"]] as const) {
    try { await access(path.join(directory, file)); return manager; } catch { /* next */ }
  }
  return "npm";
}
