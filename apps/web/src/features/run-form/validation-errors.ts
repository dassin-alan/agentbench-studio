export type RunValidationIssue = {
  readonly path: readonly PropertyKey[];
  readonly message: string;
};

const fieldMessages: Record<string, string> = {
  name: "请填写评测名称（例如：AI 工具目录双项目评测）",
  "projects.0.localPath": "请填写项目 A 的本地路径",
  "projects.1.localPath": "请填写项目 B 的本地路径",
  "projects.0.startCommand": "请填写项目 A 的启动命令",
  "projects.1.startCommand": "请填写项目 B 的启动命令",
  "projects.0.baseUrl": "请填写正确的项目 A 访问地址",
  "projects.1.baseUrl": "请填写正确的项目 B 访问地址",
};

export function formatRunValidationIssues(issues: readonly RunValidationIssue[]): string {
  const messages = issues.map((issue) => {
    const path = issue.path.map(String).join(".");
    return fieldMessages[path] ?? `请检查“${path || "评测配置"}”的填写内容`;
  });
  return `${[...new Set(messages)].join("；")}。`;
}

export function wizardStepForIssues(issues: readonly RunValidationIssue[]): number {
  const roots = new Set(issues.map((issue) => String(issue.path[0] ?? "")));
  if (roots.has("name") || roots.has("projects")) return 0;
  if (roots.has("requirements")) return 1;
  if (roots.has("testCases")) return 2;
  return 3;
}
