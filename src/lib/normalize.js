import { LIMITS } from './constants.js';
import { absoluteUrl, adfToText, stripHighlight, truncate } from './text.js';

export function personFromJira(user) {
  if (!user || user.active === false && !user.accountId && !user.displayName) return null;
  if (!user.accountId && !user.displayName) return null;
  return {
    accountId: user.accountId || null,
    displayName: user.displayName || 'Unknown',
  };
}

function names(values, pick) {
  return (values || []).map(pick).filter(Boolean);
}

export function normalizeJiraIssue(raw) {
  const fields = raw?.fields || {};
  const description = adfToText(fields.description).trim();
  const comments = (fields.comment?.comments || []).slice(-LIMITS.comments).map((comment) => ({
    author: personFromJira(comment.author),
    text: truncate(adfToText(comment.body).trim(), 600),
    at: comment.created || null,
  }));
  return {
    key: raw?.key || '',
    id: raw?.id ? String(raw.id) : '',
    summary: fields.summary || '',
    descriptionText: truncate(description, 2000),
    issueType: fields.issuetype?.name || '',
    status: fields.status?.name || '',
    priority: fields.priority?.name || '',
    labels: fields.labels || [],
    components: names(fields.components, (component) => component.name),
    assignee: personFromJira(fields.assignee),
    reporter: personFromJira(fields.reporter),
    comments,
    links: (fields.issuelinks || []).map(normalizeIssueLink).filter(Boolean),
    projectKey: fields.project?.key || '',
  };
}

export function normalizeIssueLink(link) {
  const node = link?.outwardIssue || link?.inwardIssue;
  if (!node?.key) return null;
  const relationship = link.outwardIssue ? link.type?.outward : link.type?.inward;
  const statusName = node.fields?.status?.name || '';
  const category = node.fields?.status?.statusCategory?.name || '';
  return {
    key: node.key,
    summary: node.fields?.summary || '',
    relationship: relationship || link.type?.name || 'relates to',
    linked: true,
    status: statusName,
    resolved: /done|resolved|closed/i.test(`${category} ${statusName}`),
    resolution: '',
    details: '',
    assignee: personFromJira(node.fields?.assignee),
    resolver: null,
    components: names(node.fields?.components, (component) => component.name),
    labels: node.fields?.labels || [],
    url: null,
  };
}

export function normalizeSearchIssue(raw) {
  const fields = raw?.fields || {};
  const statusName = fields.status?.name || '';
  const category = fields.status?.statusCategory?.key || fields.status?.statusCategory?.name || '';
  const resolution = fields.resolution?.description || fields.resolution?.name || '';
  return {
    key: raw?.key || '',
    summary: fields.summary || '',
    status: statusName,
    resolved: Boolean(fields.resolution) || /done/i.test(String(category)),
    resolution: truncate(typeof resolution === 'string' ? resolution : adfToText(resolution), 400),
    details: truncate(adfToText(fields.description).trim(), 500),
    assignee: personFromJira(fields.assignee),
    resolver: null,
    components: names(fields.components, (component) => component.name),
    labels: fields.labels || [],
    linked: false,
    url: null,
  };
}

export function resolverFromChangelog(changelog) {
  const histories = changelog?.values || changelog?.histories || [];
  let best = null;
  for (const history of histories) {
    const status = (history.items || []).find((item) => item.field === 'status' || item.fieldId === 'status');
    const destination = `${status?.toString || ''} ${status?.to || ''}`;
    if (!status || !/done|resolved|closed|fixed/i.test(destination)) continue;
    const at = history.created || '';
    if (best && at < best.at) continue;
    best = {
      accountId: history.author?.accountId || null,
      displayName: history.author?.displayName || 'Unknown',
      at,
    };
  }
  return best;
}

export function normalizeConfluenceResult(raw, siteUrl) {
  const content = raw?.content || {};
  const path = raw?.url || content?._links?.webui || '';
  return {
    id: String(content.id || raw?.id || path || raw?.title || 'page'),
    title: raw?.title || content.title || 'Untitled page',
    excerpt: truncate(stripHighlight(raw?.excerpt || ''), 280),
    space: raw?.resultGlobalContainer?.title || '',
    url: absoluteUrl(path, siteUrl),
  };
}

function authorFromBitbucket(user, raw) {
  const display = user?.display_name || user?.displayName || parseRawAuthor(raw) || 'Unknown author';
  return {
    accountId: user?.account_id || user?.accountId || null,
    displayName: display,
  };
}

function parseRawAuthor(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw.replace(/<[^>]+>/, '').trim();
}

export function normalizeCommit(raw, repository, files = []) {
  return {
    id: raw?.hash || raw?.id || '',
    message: truncate(String(raw?.message || '').split('\n')[0], 240),
    url: raw?.links?.html?.href || null,
    at: raw?.date || null,
    files,
    repository: repository ? `${repository.workspace}/${repository.repo}` : '',
    author: authorFromBitbucket(raw?.author?.user, raw?.author?.raw),
  };
}

export function normalizePullRequest(raw, repository) {
  return {
    id: String(raw?.id ?? ''),
    title: raw?.title || 'Pull request',
    state: String(raw?.state || 'OPEN').toUpperCase(),
    url: raw?.links?.html?.href || null,
    sourceBranch: raw?.source?.branch?.name || '',
    at: raw?.updated_on || raw?.created_on || null,
    repository: repository ? `${repository.workspace}/${repository.repo}` : '',
    author: authorFromBitbucket(raw?.author, ''),
  };
}

export function environmentFromRef(ref) {
  if (!ref) return 'unknown';
  if (/^(main|master|production|prod|release)$/i.test(ref)) return 'production';
  if (/staging|stage/i.test(ref)) return 'staging';
  return ref;
}

export function normalizePipeline(raw, repository) {
  const result = raw?.state?.result?.name || raw?.state?.name || 'UNKNOWN';
  const ref = raw?.target?.ref_name || raw?.target?.refName || '';
  const buildNumber = raw?.build_number || raw?.buildNumber || String(raw?.uuid || '').replace(/[{}]/g, '');
  const workspace = repository?.workspace;
  const repo = repository?.repo;
  return {
    id: String(buildNumber),
    name: `Pipeline ${buildNumber}`,
    environment: environmentFromRef(ref),
    state: normalizeDeployState(result),
    url: workspace && repo ? `https://bitbucket.org/${workspace}/${repo}/pipelines/results/${buildNumber}` : null,
    at: raw?.created_on || raw?.createdOn || null,
    commitMessage: truncate(String(raw?.target?.commit?.message || '').split('\n')[0], 240),
    ref,
    repository: workspace && repo ? `${workspace}/${repo}` : '',
  };
}

export function normalizeDeployState(result) {
  const value = String(result || '');
  if (/FAIL|ERROR/i.test(value)) return 'failed';
  if (/STOP/i.test(value)) return 'stopped';
  if (/SUCCESS/i.test(value)) return 'successful';
  if (/PROGRESS|RUNNING|PENDING/i.test(value)) return 'running';
  return 'unknown';
}

export function pathsFromDiffstat(payload) {
  const values = payload?.values || [];
  const paths = [];
  for (const entry of values) {
    const path = entry?.new?.path || entry?.old?.path;
    if (path) paths.push(path);
  }
  return paths;
}

export function deploymentFromRemoteLink(link) {
  const url = link?.url || '';
  const title = link?.title || '';
  if (!/deploy|spinnaker|argo|octopus/i.test(`${url} ${title}`)) return null;
  const failed = /fail|error/i.test(`${url} ${title}`);
  return {
    id: `remote:${Buffer.from(url).toString('base64url').slice(0, 16) || 'link'}`,
    name: title || 'Linked deployment',
    environment: /prod/i.test(`${url} ${title}`) ? 'production' : 'linked',
    state: failed ? 'failed' : 'unknown',
    url,
    at: null,
    commitMessage: title,
    ref: '',
    repository: '',
  };
}
