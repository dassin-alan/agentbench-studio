import { describe, expect, it } from "vitest";
import { runIsolatedNode } from "../lighthouse/lighthouse-runner";

describe("Lighthouse process isolation", () => {
  it("times out a blocked audit without blocking the server event loop", async () => {
    const started = Date.now();
    const audit = runIsolatedNode("setInterval(() => {}, 1000)", 120);
    const heartbeat = await new Promise<string>((resolve) => setTimeout(() => resolve("responsive"), 20));
    const result = await audit;
    expect(heartbeat).toBe("responsive");
    expect(result.status).toBe("timeout");
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
