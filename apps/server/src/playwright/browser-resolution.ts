import { access } from "node:fs/promises";
import { chromium } from "playwright";

export function browserExecutableCandidates(
  environment: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  playwrightPath = chromium.executablePath()
): string[] {
  const candidates = [environment.PLAYWRIGHT_EXECUTABLE_PATH, playwrightPath];
  if (platform === "win32") {
    candidates.push(
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
    );
  }
  return [...new Set(candidates.filter((candidate): candidate is string => Boolean(candidate?.trim())))];
}

export async function findBrowserExecutable(): Promise<string | undefined> {
  for (const candidate of browserExecutableCandidates()) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next deterministic candidate.
    }
  }
  return undefined;
}

