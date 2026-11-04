import { buildBrief } from './buildBrief.js';
import { collectRunbooks, collectSimilar } from './collect.js';
import { ACTION_KEYS } from '../lib/constants.js';

function causeLines(causes) {
  if (!causes?.length) return 'No likely cause cleared the evidence threshold.';
  return causes.map((cause) => `${cause.rank}. ${cause.title} (${cause.confidenceLabel}, ${cause.confidence})`).join('\n');
}

function checklistLines(checklist) {
  if (!checklist?.length) return 'No actions.';
  return checklist.map((entry) => `${entry.priority}: ${entry.title}`).join('\n');
}

export async function runAction(name, input = {}, deps = {}) {
  if (!ACTION_KEYS.includes(name)) {
    return {
      ok: false,
      code: 'unknown-action',
      error: 'That action is not part of Incident Context Copilot.',
    };
  }
  if (!input.issueKey) {
    return {
      ok: false,
      code: 'missing-issue',
      error: 'Provide an issue key such as PAY-204, or open a Jira work item and ask again.',
    };
  }

  if (name === 'find-similar-incidents') {
    const result = await collectSimilar(input, deps.clients || {});
    const summary = result.issues.length
      ? result.issues.map((issue) => `${issue.key}: ${issue.summary}`).join('\n')
      : 'No similar issues were returned.';
    return {
      ok: true,
      action: name,
      issueKey: input.issueKey,
      jql: result.jql,
      issues: result.issues,
      notes: result.notes,
      summary,
    };
  }

  if (name === 'find-runbooks') {
    const result = await collectRunbooks(input, deps.clients || {});
    const summary = result.pages.length
      ? result.pages.map((page) => page.title).join('\n')
      : 'No runbook pages were returned.';
    return {
      ok: true,
      action: name,
      issueKey: input.issueKey,
      cql: result.cql,
      pages: result.pages,
      notes: result.notes,
      summary,
    };
  }

  const brief = await buildBrief({
    ...input,
    useLlm: name === 'gather-incident-context' ? Boolean(input.useLlm) : false,
  }, deps);

  if (name === 'gather-incident-context') {
    return { ok: true, action: name, summary: brief.narrative, brief };
  }
  if (name === 'rank-likely-causes') {
    return {
      ok: true,
      action: name,
      issueKey: input.issueKey,
      summary: causeLines(brief.causes),
      narrative: brief.narrative,
      causes: brief.causes,
      meta: brief.meta,
    };
  }
  if (name === 'suggest-assignee') {
    const summary = brief.assignee
      ? `${brief.assignee.displayName}${brief.assignee.accountId ? ` (${brief.assignee.accountId})` : ''}: ${(brief.assignee.reasons || []).join(' ')}`
      : 'No assignee suggestion. The evidence did not name a code owner or a past resolver.';
    return {
      ok: true,
      action: name,
      issueKey: input.issueKey,
      summary,
      assignee: brief.assignee,
      meta: brief.meta,
    };
  }
  return {
    ok: true,
    action: name,
    issueKey: input.issueKey,
    summary: checklistLines(brief.checklist),
    checklist: brief.checklist,
    meta: brief.meta,
  };
}
