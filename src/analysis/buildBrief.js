import { collect, assemble } from './collect.js';
import { demoCollected, DEMO_NOW } from '../lib/demo.js';
import { suggestAssignee } from '../lib/assignee.js';
import { buildChecklist } from '../lib/checklist.js';
import { applyLlm } from '../lib/llmMerge.js';
import { renderNarrative } from '../lib/narrative.js';
import { rankCauses } from '../lib/ranking.js';

function present(context, causes, assignee, checklist, narrative, meta) {
  return {
    issue: {
      key: context.issue.key,
      summary: context.issue.summary,
      issueType: context.issue.issueType,
      status: context.issue.status,
      priority: context.issue.priority,
      assignee: context.issue.assignee,
      reporter: context.issue.reporter,
    },
    narrative,
    causes: (causes || []).map(({ actor, cluster, ...cause }) => cause),
    assignee,
    checklist,
    counts: {
      commits: context.commits.length,
      pullRequests: context.pullRequests.length,
      deployments: context.deployments.length,
      runbooks: context.runbooks.length,
      similarIssues: context.similarIssues.length,
    },
    signals: {
      exceptions: context.signals.exceptions,
      files: context.signals.files,
      statusCodes: context.signals.statusCodes,
      keywords: context.signals.keywords,
    },
    commits: context.commits,
    pullRequests: context.pullRequests,
    deployments: context.deployments,
    runbooks: context.runbooks,
    similarIssues: context.similarIssues.map((issue) => ({
      key: issue.key,
      summary: issue.summary,
      status: issue.status,
      resolved: issue.resolved,
      similarity: Math.round((issue.similarity || 0) * 100) / 100,
      linked: Boolean(issue.linked),
      assignee: issue.resolver || issue.assignee,
      url: issue.url || null,
    })),
    notes: context.notes,
    repository: context.repository,
    meta,
  };
}

export async function buildBrief(input = {}, deps = {}) {
  const demo = Boolean(input.demo);
  if (!demo && !input.issueKey) {
    const error = new Error('An issue key is required.');
    error.code = 'missing-issue';
    throw error;
  }
  const now = demo ? DEMO_NOW : (input.now || new Date().toISOString());
  const collected = input.collected || (demo ? demoCollected() : await collect(input, deps.clients || {}));
  const context = assemble(collected, input.siteUrl);
  const causes = rankCauses(context, { now });
  const assignee = suggestAssignee(context, causes);
  const checklist = buildChecklist(context, causes, assignee);
  const narrative = renderNarrative({ context, causes, assignee, checklist });
  let brief = present(context, causes, assignee, checklist, narrative, {
    source: 'deterministic',
    llmError: null,
    demo,
    generatedAt: now,
    model: null,
  });

  if (input.useLlm && deps.completeJson) {
    const llm = await applyLlm(brief, deps.completeJson);
    if (llm.used) {
      brief = present(context, llm.causes, llm.assignee, llm.checklist, llm.narrative, {
        source: 'forge-llm',
        llmError: null,
        demo,
        generatedAt: now,
        model: deps.model || null,
      });
    } else {
      brief = { ...brief, meta: { ...brief.meta, llmError: llm.error } };
    }
  }
  return brief;
}
