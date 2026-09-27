import type { TestStep } from "@agentbench/shared";

export const STEP_ACTIONS: TestStep["action"][] = ["goto", "click", "fill", "press", "waitFor", "expectVisible", "expectHidden", "expectText", "expectUrl", "expectCount", "screenshot", "wait"];

export function createStep(action: TestStep["action"]): TestStep {
  switch (action) {
    case "goto": return { action, path: "/" };
    case "click": return { action, selector: "button" };
    case "fill": return { action, selector: "input", value: "" };
    case "press": return { action, key: "Enter" };
    case "waitFor": return { action, selector: "body", state: "visible", timeoutMs: 5_000 };
    case "expectVisible": return { action, selector: "body" };
    case "expectHidden": return { action, selector: "[hidden]" };
    case "expectText": return { action, selector: "body", value: "" };
    case "expectUrl": return { action, value: "/", mode: "contains" };
    case "expectCount": return { action, selector: "body", count: 1 };
    case "screenshot": return { action, name: "capture", fullPage: false };
    case "wait": return { action, durationMs: 500 };
  }
}

