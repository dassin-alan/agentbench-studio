export type RunStatus = "draft" | "queued" | "running" | "completed" | "failed" | "cancelled";
export type ProjectId = "project-a" | "project-b";
export type RequirementStatus = "passed" | "partial" | "failed" | "untested";
export type ViewportName = "desktop" | "laptop" | "tablet" | "mobile";

export type ProjectConfig = {
  id: ProjectId;
  name: string;
  sourceAgent?: string;
  localPath: string;
  installCommand?: string;
  startCommand: string;
  port: number;
  baseUrl: string;
  workingDirectory?: string;
  startupTimeoutMs: number;
};

export type Requirement = {
  id: string;
  title: string;
  description?: string;
  priority: "must" | "should" | "could";
};

export type TestStep =
  | { action: "goto"; path: string }
  | { action: "click"; selector: string }
  | { action: "fill"; selector: string; value: string }
  | { action: "press"; selector?: string; key: string }
  | { action: "waitFor"; selector: string; state?: "visible" | "hidden" | "attached"; timeoutMs?: number }
  | { action: "expectVisible"; selector: string }
  | { action: "expectHidden"; selector: string }
  | { action: "expectText"; selector: string; value: string; exact?: boolean }
  | { action: "expectUrl"; value: string; mode?: "equals" | "contains" }
  | { action: "expectCount"; selector: string; count: number }
  | { action: "screenshot"; name: string; fullPage?: boolean }
  | { action: "wait"; durationMs: number };

export type TestCase = {
  id: string;
  name: string;
  requirementId: string;
  description?: string;
  critical: boolean;
  viewports?: ViewportName[];
  steps: TestStep[];
};

export type RunSettings = {
  runInstall: boolean;
  runLighthouse: boolean;
  runAxe: boolean;
  testMobile: boolean;
  startupTimeoutMs: number;
  stepTimeoutMs: number;
  includeAbsolutePaths: boolean;
};

export type RunProgress = {
  stage: string;
  completed: number;
  total: number;
  message?: string;
  projectId?: ProjectId;
};

export type BrowserLog = {
  type: "error" | "warning" | "pageerror" | "requestfailed";
  message: string;
  url?: string;
  timestamp: string;
  testCaseId?: string;
  stepIndex?: number;
  viewport?: ViewportName;
};

export type RequestFailure = {
  url: string;
  method: string;
  reason: string;
  resourceType: string;
  timestamp: string;
  testCaseId?: string;
  stepIndex?: number;
  viewport?: ViewportName;
};

export type ArtifactReference = {
  id: string;
  projectId: ProjectId;
  type: "screenshot" | "log" | "report";
  relativePath: string;
  label: string;
  testCaseId?: string;
  viewport?: string;
};

export type StartupResult = {
  status: "passed" | "failed" | "cancelled";
  durationMs: number;
  pid?: number;
  error?: string;
};

export type BaseCheckResult = {
  accessible: boolean;
  httpOk: boolean;
  statusCode?: number;
  hasTitle: boolean;
  title?: string;
  hasVisibleContent: boolean;
  blankPage: boolean;
  severeErrorCount: number;
  error?: string;
};

export type TestStepResult = {
  index: number;
  action: TestStep["action"];
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  viewport: string;
  error?: string;
  screenshot?: string;
  selector?: string;
};

export type TestCaseResult = {
  testCaseId: string;
  requirementId: string;
  status: "passed" | "failed" | "skipped";
  startedAt: string;
  completedAt: string;
  durationMs: number;
  steps: TestStepResult[];
  error?: string;
  screenshots: string[];
  logs: BrowserLog[];
  requestFailures?: RequestFailure[];
  critical?: boolean;
  viewport?: ViewportName;
};

export type ResponsiveResult = {
  viewport: string;
  hasHorizontalOverflow: boolean;
  documentWidth: number;
  viewportWidth: number;
  overflowAmount: number;
  oversizedElements?: Array<{ selector: string; right: number; width: number }>;
};

export type AccessibilityViolation = {
  id: string;
  title: string;
  description: string;
  impact: string | null;
  nodes: string[];
  helpUrl: string;
};

export type AccessibilityResult = {
  status: "completed" | "skipped" | "failed";
  violations: AccessibilityViolation[];
  violationCount: number;
  seriousCount: number;
  criticalCount: number;
  reason?: string;
};

export type LighthouseResult = {
  status: "completed" | "skipped" | "failed";
  categories?: {
    performance: number | null;
    accessibility: number | null;
    bestPractices: number | null;
    seo: number | null;
  };
  metrics?: {
    firstContentfulPaint?: number;
    largestContentfulPaint?: number;
    cumulativeLayoutShift?: number;
    totalBlockingTime?: number;
  };
  reason?: string;
};

export type ProjectResult = {
  projectId: string;
  status: "passed" | "failed" | "partial";
  startup: StartupResult;
  baseChecks: BaseCheckResult;
  testCases: TestCaseResult[];
  browserLogs: BrowserLog[];
  requestFailures: RequestFailure[];
  responsive: ResponsiveResult[];
  accessibility?: AccessibilityResult;
  lighthouse?: LighthouseResult;
  metrics: {
    startupDurationMs?: number;
    pageLoadDurationMs?: number;
    testDurationMs: number;
  };
  artifacts: ArtifactReference[];
};

export type RequirementProjectEvidence = {
  status: RequirementStatus;
  evidence: string[];
  passedTests?: number;
  totalTests?: number;
};

export type RequirementMatrixEntry = {
  requirement: Requirement;
  testCaseIds: string[];
  projectA: RequirementProjectEvidence;
  projectB: RequirementProjectEvidence;
};

export type ScoreBreakdown = {
  total: number | null;
  requirementCompletion: number;
  verifiedPassRate: number;
  requirementCoverage: number;
  effectiveRequirementScore: number;
  criticalInteractions: number;
  stability: number;
  performance: number;
  performanceEstimated: boolean;
  responsive: number;
  accessibility: number;
  baseQuality: number;
  evidenceCoverage: number;
  executionCoverage: number;
  assertionCoverage: number;
  strongEvidenceCoverage: number;
  scoreCap: number | null;
  capReasons: string[];
  explanations: Partial<Record<ScoreDimension, ScoreExplanation>>;
  unexecutedChecks: string[];
};

export type ScoreDimension = "total" | "requirement" | "criticalInteractions" | "stability" | "performance" | "responsive" | "accessibility" | "baseQuality" | "evidence";
export type ScoreAdjustment = { label: string; value: number };
export type ScoreCapExplanation = { label: string; limit: number };
export type ScoreExplanation = {
  baseValue: number | null;
  deductions: ScoreAdjustment[];
  bonuses: ScoreAdjustment[];
  caps: ScoreCapExplanation[];
  finalValue: number | null;
};

export type EvaluationConfidence = "high" | "medium" | "low";
export type ReleaseJudgement = "ready" | "conditional" | "blocked" | "not-comparable";
export type BlockerSeverity = "p0" | "p1" | "warning";
export type EvaluationBlocker = {
  id: string;
  severity: BlockerSeverity;
  source: "startup" | "base-check" | "requirement" | "test" | "browser" | "network" | "responsive" | "accessibility" | "lighthouse" | "coverage";
  message: string;
  projectId?: ProjectId;
  requirementId?: string;
  testCaseId?: string;
  evidencePaths?: string[];
};

export type FinalEvaluation = {
  blockers: EvaluationBlocker[];
  comparable: boolean;
  notComparableReasons: string[];
  confidence: EvaluationConfidence;
  confidenceReasons: string[];
  releaseJudgement: ReleaseJudgement;
  releaseReasons: string[];
  recommendedProjectId: ProjectId | null;
  recommendedProjectName: string;
  recommendedDevelopmentBase: ProjectId | null;
  releaseRecommendedProject: ProjectId | null;
  recommendationReasons: string[];
  decisionScore: number | null;
  executionCoverage: number;
  assertionCoverage: number;
  strongEvidenceCoverage: number;
  nextIterationPrompt: string;
};

export type ReleaseAssessment = {
  comparable: boolean;
  notComparableReasons: string[];
  confidence: EvaluationConfidence;
  confidenceReasons: string[];
  evidenceCoverage: number;
  releaseJudgement: ReleaseJudgement;
  releaseReasons: string[];
};

export type DecisionSummary = {
  recommendedProjectId: ProjectId | null;
  recommendedProjectName: string;
  reasons: string[];
  blockers: Record<ProjectId, string[]>;
  transferableAdvantages: string[];
  nextIterationPrompt: string;
};

export type ComparisonResult = {
  projectResults: [ProjectResult, ProjectResult];
  requirementMatrix: RequirementMatrixEntry[];
  scores: Record<ProjectId, ScoreBreakdown>;
  evaluation?: FinalEvaluation;
  decision: DecisionSummary;
  assessment: ReleaseAssessment;
  generatedAt: string;
};

export type BenchmarkRunInput = {
  name: string;
  description?: string;
  projects: [ProjectConfig, ProjectConfig];
  requirements: Requirement[];
  testCases: TestCase[];
  settings: RunSettings;
};

export type BenchmarkRun = BenchmarkRunInput & {
  id: string;
  status: RunStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  progress: RunProgress;
  results?: ComparisonResult;
  error?: string;
};

export type RunEvent =
  | { type: "stage"; stage: string; projectId?: ProjectId }
  | { type: "log"; level: "info" | "warning" | "error"; message: string; projectId?: ProjectId }
  | { type: "progress"; completed: number; total: number }
  | { type: "artifact"; artifact: ArtifactReference }
  | { type: "result"; result: ComparisonResult }
  | { type: "error"; message: string }
  | { type: "completed" }
  | { type: "cancelled" };

export type ProjectDetectionResult = {
  exists: boolean;
  hasPackageJson: boolean;
  packageManager?: "npm" | "pnpm" | "yarn";
  framework?: "vite" | "react" | "next" | "vue" | "static" | "unknown";
  availableScripts: string[];
  suggestedInstallCommand?: string;
  suggestedStartCommand?: string;
  possiblePort?: number;
  error?: string;
};
