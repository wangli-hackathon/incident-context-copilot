import { buildRunbookCql, buildSimilarIssueJql } from '../lib/queries.js';
import { extractSignals } from '../lib/signals.js';
import { extractUrls, parseBitbucketUrl, tokenSimilarity, truncate } from '../lib/text.js';
import { deploymentFromRemoteLink } from '../lib/normalize.js';

async function settle(fn) {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return { ok: false, error };
  }
}

function noteFrom(code, error) {
  const status = error?.status ? ` (${error.status})` : '';
  const message = truncate(String(error?.message || 'Request failed'), 180);
  return { code, message: `${message}${status}` };
}

function issueText(issue) {
  return [issue.summary, issue.descriptionText, ...(issue.comments || []).map((comment) => comment.text)]
    .filter(Boolean)
    .join('\n');
}

export function chooseRepository(hint, urls) {
  if (hint?.workspace && hint?.repo) return { workspace: hint.workspace, repo: hint.repo, source: 'saved' };
  const counts = new Map();
  for (const url of urls) {
    const parsed = parseBitbucketUrl(url);
    if (!parsed) continue;
    const key = `${parsed.workspace}/${parsed.repo}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const top = [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
  if (!top) return null;
  const [workspace, repo] = top[0].split('/');
  return { workspace, repo, source: 'link' };
}

export function mergeSimilar(found, links, selfKey, siteUrl) {
  const map = new Map();
  const withUrl = (issue) => ({
    ...issue,
    url: issue.url || (siteUrl && issue.key ? `${String(siteUrl).replace(/\/$/, '')}/browse/${issue.key}` : null),
  });
  for (const issue of found || []) {
    if (!issue?.key || issue.key === selfKey) continue;
    map.set(issue.key, withUrl(issue));
  }
  for (const link of links || []) {
    if (!link?.key || link.key === selfKey) continue;
    const existing = map.get(link.key);
    if (existing) {
      existing.linked = true;
      if (!existing.relationship) existing.relationship = link.relationship;
    } else {
      map.set(link.key, withUrl({ ...link, linked: true }));
    }
  }
  return [...map.values()];
}

export function assemble(collected, siteUrl) {
  const issue = collected.issue;
  const text = issueText(issue);
  const signals = extractSignals({ summary: issue.summary, text });
  const similarIssues = mergeSimilar(collected.similarIssues, issue.links, issue.key, siteUrl).map((similar) => ({
    ...similar,
    similarity: tokenSimilarity(text, `${similar.summary || ''} ${similar.details || ''} ${similar.resolution || ''}`),
  }));
  return {
    issue,
    signals,
    commits: collected.commits || [],
    pullRequests: collected.pullRequests || [],
    deployments: collected.deployments || [],
    runbooks: collected.runbooks || [],
    similarIssues,
    notes: collected.notes || [],
    repository: collected.repository || null,
  };
}

async function loadIssue(input, clients) {
  const [issueOutcome, linksOutcome] = await Promise.all([
    settle(() => clients.fetchIssue(input.issueKey)),
    settle(() => clients.fetchRemoteLinks(input.issueKey)),
  ]);
  if (!issueOutcome.ok) {
    const error = issueOutcome.error instanceof Error ? issueOutcome.error : new Error('Jira did not return this work item.');
    error.code = error.code || 'issue-unavailable';
    throw error;
  }
  const notes = [];
  const remoteLinks = linksOutcome.ok ? linksOutcome.value : [];
  if (!linksOutcome.ok) notes.push(noteFrom('remote-links', linksOutcome.error));
  return { issue: issueOutcome.value, remoteLinks, notes };
}

export async function collect(input, clients) {
  const { issue, remoteLinks, notes } = await loadIssue(input, clients);
  const text = issueText(issue);
  const signals = extractSignals({ summary: issue.summary, text });
  const urls = [
    ...extractUrls(text),
    ...remoteLinks.map((link) => link.url).filter(Boolean),
  ];
  const repository = chooseRepository(input.repoHint, urls);
  const jql = buildSimilarIssueJql({
    projectKey: input.projectKey || issue.projectKey,
    issueKey: issue.key,
    terms: signals.keywords,
  });
  const cql = buildRunbookCql(signals.keywords);

  const [similarOutcome, runbookOutcome, codeOutcome] = await Promise.all([
    jql ? settle(() => clients.fetchSimilar({ jql, siteUrl: input.siteUrl })) : Promise.resolve({ ok: true, value: [] }),
    cql ? settle(() => clients.fetchRunbooks({ cql, siteUrl: input.siteUrl })) : Promise.resolve({ ok: true, value: [] }),
    repository
      ? settle(() => clients.fetchCode({ ...repository, issueKey: issue.key, signals }))
      : Promise.resolve({ ok: false, error: new Error('No Bitbucket repository is saved on this project, and the work item has no Bitbucket link.') }),
  ]);

  if (!jql) notes.push({ code: 'no-search-terms', message: 'Not enough distinctive words to search for similar issues.' });
  if (!similarOutcome.ok) notes.push(noteFrom('similar-search', similarOutcome.error));
  if (!cql) notes.push({ code: 'no-runbook-terms', message: 'Not enough distinctive words to search Confluence for a runbook.' });
  if (!runbookOutcome.ok) notes.push(noteFrom('runbooks', runbookOutcome.error));
  if (!codeOutcome.ok) notes.push(noteFrom(repository ? 'bitbucket' : 'missing-repo', codeOutcome.error));

  const code = codeOutcome.ok ? codeOutcome.value : { commits: [], pullRequests: [], deployments: [], notes: [] };
  notes.push(...(code.notes || []));
  const linkedDeploys = remoteLinks.map(deploymentFromRemoteLink).filter(Boolean);

  return {
    issue,
    commits: code.commits || [],
    pullRequests: code.pullRequests || [],
    deployments: [...(code.deployments || []), ...linkedDeploys],
    runbooks: runbookOutcome.ok ? runbookOutcome.value : [],
    similarIssues: similarOutcome.ok ? similarOutcome.value : [],
    notes,
    repository: repository ? { workspace: repository.workspace, repo: repository.repo } : null,
  };
}

export async function collectSimilar(input, clients) {
  const { issue, notes } = await loadIssue(input, clients);
  const signals = extractSignals({ summary: issue.summary, text: issueText(issue) });
  const jql = buildSimilarIssueJql({
    projectKey: input.projectKey || issue.projectKey,
    issueKey: issue.key,
    terms: signals.keywords,
  });
  if (!jql) {
    return { issues: [], jql: null, notes: [...notes, { code: 'no-search-terms', message: 'Not enough distinctive words to search.' }] };
  }
  try {
    const issues = await clients.fetchSimilar({ jql, siteUrl: input.siteUrl });
    return { issues, jql, notes };
  } catch (error) {
    return { issues: [], jql, notes: [...notes, noteFrom('similar-search', error)] };
  }
}

export async function collectRunbooks(input, clients) {
  const { issue, notes } = await loadIssue(input, clients);
  const signals = extractSignals({ summary: issue.summary, text: issueText(issue) });
  const cql = buildRunbookCql(signals.keywords);
  if (!cql) {
    return { pages: [], cql: null, notes: [...notes, { code: 'no-runbook-terms', message: 'Not enough distinctive words to search Confluence.' }] };
  }
  try {
    const pages = await clients.fetchRunbooks({ cql, siteUrl: input.siteUrl });
    return { pages, cql, notes };
  } catch (error) {
    return { pages: [], cql, notes: [...notes, noteFrom('runbooks', error)] };
  }
}
