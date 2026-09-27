import { z } from "zod";

const id = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/, "ID 只能包含字母、数字、下划线和连字符");
const httpUrl = z.string().url().refine((value) => value.startsWith("http://") || value.startsWith("https://"), "baseUrl 必须使用 HTTP 或 HTTPS");
export const normalizeLocalPathInput = (value: string): string => {
  const trimmed = value.trim();
  const wrappedInMatchingQuotes = trimmed.length >= 2
    && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")));
  return wrappedInMatchingQuotes ? trimmed.slice(1, -1).trim() : trimmed;
};
const localProjectPath = z.string().transform(normalizeLocalPathInput).pipe(z.string().min(1).max(2_000));

export const ProjectConfigSchema = z.object({
  id: z.enum(["project-a", "project-b"]),
  name: z.string().trim().min(1).max(120),
  sourceAgent: z.string().trim().max(100).optional(),
  localPath: localProjectPath,
  installCommand: z.string().trim().max(500).optional(),
  startCommand: z.string().trim().min(1).max(500),
  port: z.number().int().min(1).max(65535),
  baseUrl: httpUrl,
  workingDirectory: z.string().trim().min(1).optional(),
  startupTimeoutMs: z.number().int().min(1_000).max(600_000)
}).strict();

export const RequirementSchema = z.object({
  id,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000).optional(),
  priority: z.enum(["must", "should", "could"])
}).strict();

const selector = z.string().trim().min(1).max(1_000);
export const TestStepSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("goto"), path: z.string().trim().min(1).max(2_000) }).strict(),
  z.object({ action: z.literal("click"), selector }).strict(),
  z.object({ action: z.literal("fill"), selector, value: z.string().max(10_000) }).strict(),
  z.object({ action: z.literal("press"), selector: selector.optional(), key: z.string().trim().min(1).max(100) }).strict(),
  z.object({ action: z.literal("waitFor"), selector, state: z.enum(["visible", "hidden", "attached"]).optional(), timeoutMs: z.number().int().min(1).max(120_000).optional() }).strict(),
  z.object({ action: z.literal("expectVisible"), selector }).strict(),
  z.object({ action: z.literal("expectHidden"), selector }).strict(),
  z.object({ action: z.literal("expectText"), selector, value: z.string().max(10_000), exact: z.boolean().optional() }).strict(),
  z.object({ action: z.literal("expectUrl"), value: z.string().trim().min(1).max(2_000), mode: z.enum(["equals", "contains"]).optional() }).strict(),
  z.object({ action: z.literal("expectCount"), selector, count: z.number().int().min(0).max(100_000) }).strict(),
  z.object({ action: z.literal("screenshot"), name: id, fullPage: z.boolean().optional() }).strict(),
  z.object({ action: z.literal("wait"), durationMs: z.number().int().min(0).max(60_000) }).strict()
]);

export const TestCaseSchema = z.object({
  id,
  name: z.string().trim().min(1).max(200),
  requirementId: id,
  description: z.string().trim().max(2_000).optional(),
  critical: z.boolean(),
  viewports: z.array(z.enum(["desktop", "laptop", "tablet", "mobile"])).min(1).max(4).default(["desktop"]),
  steps: z.array(TestStepSchema).min(1).max(100)
}).strict();

export const RunSettingsSchema = z.object({
  runInstall: z.boolean(),
  runLighthouse: z.boolean(),
  runAxe: z.boolean(),
  testMobile: z.boolean(),
  includeAbsolutePaths: z.boolean().default(false),
  startupTimeoutMs: z.number().int().min(1_000).max(600_000),
  stepTimeoutMs: z.number().int().min(250).max(120_000)
}).strict();

const BenchmarkRunInputBaseSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5_000).optional(),
  projects: z.tuple([
    ProjectConfigSchema.extend({ id: z.literal("project-a") }),
    ProjectConfigSchema.extend({ id: z.literal("project-b") })
  ]),
  requirements: z.array(RequirementSchema).max(200),
  testCases: z.array(TestCaseSchema).max(500),
  settings: RunSettingsSchema
}).strict();

const validateReferences = (value: z.infer<typeof BenchmarkRunInputBaseSchema>, context: z.RefinementCtx) => {
  const requirementIds = new Set(value.requirements.map((requirement) => requirement.id));
  const duplicateRequirements = value.requirements.filter((requirement, index, all) => all.findIndex((item) => item.id === requirement.id) !== index);
  const duplicateTests = value.testCases.filter((testCase, index, all) => all.findIndex((item) => item.id === testCase.id) !== index);
  if (duplicateRequirements.length > 0) context.addIssue({ code: z.ZodIssueCode.custom, message: `需求 ID 重复：${duplicateRequirements[0]?.id ?? "unknown"}`, path: ["requirements"] });
  if (duplicateTests.length > 0) context.addIssue({ code: z.ZodIssueCode.custom, message: `测试 ID 重复：${duplicateTests[0]?.id ?? "unknown"}`, path: ["testCases"] });
  for (const testCase of value.testCases) {
    if (!requirementIds.has(testCase.requirementId)) context.addIssue({ code: z.ZodIssueCode.custom, message: `测试 ${testCase.id} 关联了不存在的需求 ${testCase.requirementId}`, path: ["testCases"] });
  }
};

export const BenchmarkRunInputSchema = BenchmarkRunInputBaseSchema.superRefine(validateReferences);

export const RunStatusSchema = z.enum(["draft", "queued", "running", "completed", "failed", "cancelled"]);
export const BenchmarkRunSchema = BenchmarkRunInputBaseSchema.extend({
  id,
  status: RunStatusSchema,
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  progress: z.object({ stage: z.string(), completed: z.number().int().min(0), total: z.number().int().min(0), message: z.string().optional(), projectId: z.enum(["project-a", "project-b"]).optional() }),
  results: z.unknown().optional(),
  error: z.string().optional()
}).strict().superRefine(validateReferences);

export const ProjectDetectionRequestSchema = z.object({ path: localProjectPath }).strict();
export const RunIdParamsSchema = z.object({ id });
