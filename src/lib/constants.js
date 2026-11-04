/** Sonnet 4.6 stays active past this hackathon. Haiku 4.5's tentative retirement began 15 Oct 2026. */
export const LLM_MODEL = 'claude-sonnet-4-6';

export const DEMO_NOW = '2026-11-04T12:00:00.000Z';

export const LIMITS = {
  commits: 30,
  diffstats: 5,
  pullRequests: 10,
  pipelines: 10,
  similar: 8,
  changelogLookups: 3,
  runbooks: 5,
  comments: 5,
  causes: 5,
  checklist: 8,
};

export const WEIGHTS = {
  mentionsIssueKey: 22,
  fileOverlap: 26,
  exceptionInMessage: 12,
  recentHours48: 14,
  recentDays7: 8,
  recentDays30: 4,
  openPullRequest: 12,
  mergedPullRequest: 8,
  failedDeploy: 30,
  prodEnvironment: 12,
  hotfix: 10,
  similarResolved: 16,
  similarOpen: 4,
  componentOverlap: 10,
  labelOverlap: 6,
  linkedIssue: 12,
  signature: 28,
};

/** Multiplier applied to Jaccard similarity when scoring a past issue. */
export const SIMILARITY_WEIGHT = 50;

/** Causes below this confidence are kept in the evidence tabs and omitted from the ranking. */
export const MIN_CONFIDENCE = 25;

export const ACTION_KEYS = [
  'gather-incident-context',
  'rank-likely-causes',
  'suggest-assignee',
  'build-action-checklist',
  'find-similar-incidents',
  'find-runbooks',
];

export const HOTFIX_PATTERN = /\b(revert|hotfix|rollback|rolled back)\b/i;

export const GENERIC_BASENAMES = new Set([
  'index.js',
  'index.jsx',
  'index.ts',
  'index.tsx',
  'readme.md',
  'package.json',
]);
