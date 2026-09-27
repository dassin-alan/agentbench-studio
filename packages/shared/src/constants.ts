export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  laptop: { width: 1280, height: 720 },
  tablet: { width: 1024, height: 768 },
  mobile: { width: 390, height: 844 }
} as const;

export const SCORE_WEIGHTS = {
  requirementCompletion: 35,
  criticalInteractions: 25,
  stability: 15,
  performance: 10,
  responsive: 8,
  accessibility: 4,
  baseQuality: 3
} as const;

export const DEFAULT_PROGRESS = { stage: "draft", completed: 0, total: 10 } as const;
