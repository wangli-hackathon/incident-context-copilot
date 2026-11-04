import { LIMITS } from './constants.js';
import { parseJsonObject, truncate } from './text.js';

const PRIORITIES = new Set(['now', 'next', 'later']);

export function buildLlmMessages(brief) {
  const evidence = {
    issue: brief.issue,
    signals: brief.signals,
    causes: (brief.causes || []).map((cause) => ({
      id: cause.id,
      title: cause.title,
      summary: cause.summary,
      confidence: cause.confidence,
      kind: cause.kind,
    })),
    assignee: brief.assignee
      ? {
        accountId: brief.assignee.accountId,
        displayName: brief.assignee.displayName,
        alternates: (brief.assignee.alternates || []).map((person) => ({
          accountId: person.accountId,
          displayName: person.displayName,
        })),
      }
      : null,
    checklist: brief.checklist,
    notes: (brief.notes || []).map((note) => note.message),
  };
  return [
    {
      role: 'system',
      content: [
        'You rewrite an incident brief for an on-call engineer.',
        'Use only the evidence JSON. Do not add commits, deploys, people, or pages that are not in it.',
        'Return one JSON object and no markdown.',
        'Schema: {"summary": string, "causes": [{"id": string, "narrative": string}], "assigneeAccountId": string | null, "checklist": [{"id": string, "title": string, "detail": string, "priority": "now" | "next" | "later"}]}.',
        'Every cause id must be copied from the evidence. You may reorder causes. You may not invent ids.',
        `The summary must mention ${brief.issue?.key || 'the issue key'} and stay under 700 characters.`,
      ].join(' '),
    },
    {
      role: 'user',
      content: JSON.stringify(evidence),
    },
  ];
}

function knownPeople(assignee) {
  if (!assignee) return [];
  return [assignee, ...(assignee.alternates || [])].filter((person) => person?.accountId);
}

export function mergeLlmPayload(brief, parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const known = new Map((brief.causes || []).map((cause) => [cause.id, cause]));
  let causes = brief.causes;
  if (Array.isArray(parsed.causes) && parsed.causes.length) {
    const used = new Set();
    const reordered = [];
    for (const entry of parsed.causes) {
      const cause = known.get(entry?.id);
      if (!cause || used.has(cause.id)) continue;
      used.add(cause.id);
      const narrative = typeof entry.narrative === 'string' ? entry.narrative.trim() : '';
      reordered.push(narrative.length >= 20 && narrative.length <= 400
        ? { ...cause, summary: narrative }
        : cause);
    }
    for (const cause of brief.causes) {
      if (!used.has(cause.id)) reordered.push(cause);
    }
    causes = reordered.map((cause, index) => ({ ...cause, rank: index + 1 }));
  }

  let narrative = brief.narrative;
  if (typeof parsed.summary === 'string') {
    const summary = parsed.summary.trim();
    const key = brief.issue?.key;
    if (summary.length >= 40 && summary.length <= 800 && (!key || summary.includes(key))) {
      narrative = summary;
    }
  }

  let assignee = brief.assignee;
  if (Object.prototype.hasOwnProperty.call(parsed, 'assigneeAccountId') && brief.assignee) {
    const requested = parsed.assigneeAccountId;
    const match = knownPeople(brief.assignee).find((person) => person.accountId === requested);
    if (match && match.accountId !== brief.assignee.accountId) {
      const demoted = {
        accountId: brief.assignee.accountId,
        displayName: brief.assignee.displayName,
        confidence: brief.assignee.confidence,
        reasons: brief.assignee.reasons,
      };
      assignee = {
        ...match,
        confidence: match.confidence || brief.assignee.confidence,
        reasons: match.reasons || ['Chosen by Forge LLM from the evidence-backed candidates.'],
        alternates: [demoted, ...(brief.assignee.alternates || [])].filter((person) => person.accountId !== match.accountId).slice(0, 2),
      };
    }
  }

  let checklist = brief.checklist;
  if (Array.isArray(parsed.checklist) && parsed.checklist.length) {
    const rewritten = [];
    for (const entry of parsed.checklist) {
      const title = typeof entry?.title === 'string' ? entry.title.trim() : '';
      const detail = typeof entry?.detail === 'string' ? entry.detail.trim() : '';
      const priority = PRIORITIES.has(entry?.priority) ? entry.priority : null;
      const id = typeof entry?.id === 'string' && /^[a-z0-9-]{3,40}$/.test(entry.id) ? entry.id : null;
      if (!title || title.length > 140 || !priority || !id) continue;
      rewritten.push({ id, priority, title, detail: truncate(detail, 300) });
      if (rewritten.length === LIMITS.checklist) break;
    }
    if (rewritten.length) {
      const seen = new Set(rewritten.map((entry) => entry.id));
      for (const required of brief.checklist.filter((entry) => entry.priority === 'now')) {
        if (!seen.has(required.id)) rewritten.push(required);
      }
      const order = { now: 0, next: 1, later: 2 };
      checklist = rewritten
        .sort((left, right) => order[left.priority] - order[right.priority] || left.id.localeCompare(right.id))
        .slice(0, LIMITS.checklist);
    }
  }

  return { narrative, causes, assignee, checklist };
}

export async function applyLlm(brief, completeJson) {
  try {
    const raw = await completeJson(buildLlmMessages(brief));
    const parsed = parseJsonObject(typeof raw === 'string' ? raw : '');
    if (!parsed) return { used: false, error: 'Forge LLM did not return JSON. Showing the evidence ranking.' };
    const merged = mergeLlmPayload(brief, parsed);
    if (!merged) return { used: false, error: 'Forge LLM response did not match the evidence. Showing the evidence ranking.' };
    return { used: true, ...merged };
  } catch (error) {
    const message = String(error?.message || 'Forge LLM request failed.');
    return { used: false, error: message.replace(/\s+/g, ' ').slice(0, 240) };
  }
}

