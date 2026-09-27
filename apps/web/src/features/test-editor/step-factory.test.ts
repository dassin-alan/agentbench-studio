import { describe, expect, it } from "vitest";
import { TestStepSchema, type TestStep } from "@agentbench/shared";
import { STEP_ACTIONS, createStep } from "./step-factory";

describe("simple test step factory", () => {
  it("creates a valid deterministic DSL object for every supported action", () => {
    const expected: TestStep["action"][] = ["goto", "click", "fill", "press", "waitFor", "expectVisible", "expectHidden", "expectText", "expectUrl", "expectCount", "screenshot", "wait"];
    expect(STEP_ACTIONS).toEqual(expected);
    for (const action of STEP_ACTIONS) {
      const step = createStep(action);
      expect(step.action).toBe(action);
      expect(TestStepSchema.safeParse(step).success, action).toBe(true);
    }
  });
});

