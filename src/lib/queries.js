import { escapeJqlPhrase, safeTerm } from './text.js';

function cleanTerms(terms) {
  const seen = new Set();
  const cleaned = [];
  for (const term of terms || []) {
    const safe = safeTerm(term);
    if (!safe || safe.length < 4 || seen.has(safe)) continue;
    seen.add(safe);
    cleaned.push(safe);
    if (cleaned.length === 4) break;
  }
  return cleaned;
}

export function buildSimilarIssueJql({ projectKey, issueKey, terms }) {
  const safeTerms = cleanTerms(terms);
  if (!projectKey && safeTerms.length === 0) return null;
  const filters = ['type in (Bug, Incident, Problem)'];
  if (projectKey) filters.push(`project = "${escapeJqlPhrase(projectKey)}"`);
  if (issueKey) filters.push(`key != "${escapeJqlPhrase(issueKey)}"`);
  if (safeTerms.length) {
    filters.push(`(${safeTerms.map((term) => `text ~ "${escapeJqlPhrase(term)}"`).join(' OR ')})`);
  }
  return `${filters.join(' AND ')} ORDER BY updated DESC`;
}

export function buildRunbookCql(terms) {
  const safeTerms = cleanTerms(terms);
  if (!safeTerms.length) return null;
  const runbook = '(text ~ "runbook" OR text ~ "incident response" OR label = "runbook")';
  const focus = safeTerms.map((term) => `text ~ "${escapeJqlPhrase(term)}"`).join(' OR ');
  return `type = page AND ${runbook} AND (${focus})`;
}
