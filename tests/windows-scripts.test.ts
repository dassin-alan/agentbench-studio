import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(".");
const read = (name: string) => readFile(path.join(root, name), "utf8");

describe("Windows release scripts", () => {
  it.runIf(process.platform === "win32")("PowerShell 5.1 can decode and parse both release scripts", () => {
    for (const script of ["setup.ps1", "doctor.ps1", "scripts/start-agentbench.ps1"]) {
      const fullPath = path.join(root, script).replaceAll("'", "''");
      const parsed = spawnSync(
        "powershell.exe",
        ["-NoProfile", "-Command", `$null=[scriptblock]::Create((Get-Content -Raw -LiteralPath '${fullPath}'))`],
        { encoding: "utf8" },
      );
      expect(parsed.status, `${script}: ${parsed.stderr}`).toBe(0);
    }
  });

  it("setup validates Node 20 and installs npm plus Playwright Chromium", async () => {
    const script = await read("setup.ps1");
    expect(script).toContain("Node.js 20+");
    expect(script).toContain("$npmMajor");
    expect(script).toContain("npm.cmd ci");
    expect(script).toMatch(/npm(?:\.cmd)? install/);
    expect(script).toContain("playwright install chromium");
    expect(script).toContain("$LASTEXITCODE");
  });

  it("starter resolves its own directory, launches the app and opens the local URL", async () => {
    const script = await read("start-agentbench.bat");
    const launcher = await read("scripts/start-agentbench.ps1");
    expect(script.toLowerCase()).toContain("chcp 65001");
    expect(script).toContain("%~dp0");
    expect(script).toContain("node_modules");
    expect(script).toContain("npm run start");
    expect(script).toContain("scripts\\start-agentbench.ps1");
    expect(script).toMatch(/-File/i);
    expect(script).not.toMatch(/-Command/i);
    expect(script).toContain("http://127.0.0.1:3000");
    expect(launcher.toLowerCase()).toContain("taskkill");
  });

  it("doctor checks browsers, ports, Playwright and data write permission with structured statuses", async () => {
    const script = await read("doctor.ps1");
    for (const token of ["PLAYWRIGHT_EXECUTABLE_PATH", "Chrome", "Edge", "Playwright", "3000", "3001", "4173", "4174", "data", "PASS", "WARN", "FAIL"]) {
      expect(script).toContain(token);
    }
  });

  it("data cleaner requires confirmation and delegates to a repository-scoped script", async () => {
    const batch = await read("clean-data.bat");
    const cleaner = await read("scripts/clean-data.mjs");
    expect(batch).toMatch(/choice|set \/p/i);
    expect(batch.toLowerCase()).toContain("chcp 65001");
    expect(batch).toContain("scripts\\clean-data.mjs");
    expect(cleaner).toContain('path.join(root, "data")');
    expect(cleaner).toContain('path.join(dataRoot, "runs")');
    expect(cleaner).toContain('entry.endsWith(".log")');
    expect(cleaner).not.toContain("C:\\Users");
  });
});
