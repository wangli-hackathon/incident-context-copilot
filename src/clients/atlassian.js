import api, { route } from '@forge/api';
import { kvs } from '@forge/kvs';
import { LIMITS } from '../lib/constants.js';
import {
  normalizeCommit,
  normalizeConfluenceResult,
  normalizeJiraIssue,
  normalizePipeline,
  normalizePullRequest,
  normalizeSearchIssue,
  pathsFromDiffstat,
  resolverFromChangelog,
} from '../lib/normalize.js';
import { mentionsIssueKey, validRepoHint } from '../lib/text.js';

const JSON_HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

function asUserUnavailable(error) {
  return /asUser\(\) is only available|not available in this module|Cannot use asUser/i.test(String(error?.message || error));
}

function apiMessage(body, status) {
  if (!body || typeof body !== 'object') return `Request failed with status ${status}`;
  if (Array.isArray(body.errorMessages) && body.errorMessages[0]) return String(body.errorMessages[0]);
  if (body.message) return String(body.message);
  if (body.error?.message) return String(body.error.message);
  if (body.errors && typeof body.errors === 'object') {
    const first = Object.values(body.errors)[0];
    if (first) return String(first);
  }
  return `Request failed with status ${status}`;
}

function fail(status, body, fallback) {
  const error = new Error(fallback || apiMessage(body, status));
  error.status = status;
  return error;
}

async function callProduct(kind, path, options, allowAppFallback) {
  const send = (mode) => {
    const client = mode === 'user' ? api.asUser() : api.asApp();
    if (kind === 'jira') return client.requestJira(path, options);
    if (kind === 'confluence') return client.requestConfluence(path, options);
    return client.requestBitbucket(path, options);
  };
  try {
    return await send('user');
  } catch (error) {
    if (allowAppFallback && asUserUnavailable(error)) return send('app');
    throw error;
  }
}

async function request(kind, path, options, allowAppFallback) {
  const response = await callProduct(kind, path, {
    ...options,
    headers: { ...JSON_HEADERS, ...options?.headers },
  }, allowAppFallback);
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: text.slice(0, 180) };
    }
  }
  return { ok: response.ok, status: response.status, body };
}

function repoKey(projectKey) {
  return `repo:${projectKey}`;
}

export function createForgeClients({ allowAppFallback = true } = {}) {
  const jira = (path, options) => request('jira', path, options, allowAppFallback);
  const confluence = (path, options) => request('confluence', path, options, allowAppFallback);
  const bitbucket = (path, options) => request('bitbucket', path, options, allowAppFallback);

  return {
    async fetchIssue(issueKey) {
      const fields = 'summary,description,issuetype,status,priority,assignee,reporter,labels,components,issuelinks,comment,created,updated,resolution,project';
      const result = await jira(route`/rest/api/3/issue/${issueKey}?fields=${fields}`);
      if (!result.ok) throw fail(result.status, result.body, `Jira could not read ${issueKey}.`);
      return normalizeJiraIssue(result.body);
    },

    async fetchRemoteLinks(issueKey) {
      const result = await jira(route`/rest/api/3/issue/${issueKey}/remotelink`);
      if (!result.ok) throw fail(result.status, result.body, 'Jira could not read remote links.');
      const links = Array.isArray(result.body) ? result.body : [];
      return links.map((link) => ({
        url: link.object?.url || '',
        title: link.object?.title || '',
      })).filter((link) => link.url);
    },

    async fetchSimilar({ jql, siteUrl }) {
      const result = await jira(route`/rest/api/3/search/jql`, {
        method: 'POST',
        body: JSON.stringify({
          jql,
          maxResults: LIMITS.similar,
          fields: ['summary', 'description', 'status', 'assignee', 'resolution', 'components', 'labels', 'updated', 'issuetype'],
        }),
      });
      if (!result.ok) throw fail(result.status, result.body, 'Jira issue search failed.');
      const issues = (result.body?.issues || []).map((issue) => {
        const normalized = normalizeSearchIssue(issue);
        if (siteUrl && normalized.key) {
          normalized.url = `${String(siteUrl).replace(/\/$/, '')}/browse/${normalized.key}`;
        }
        return normalized;
      });
      await Promise.all(issues.slice(0, LIMITS.changelogLookups).map(async (issue) => {
        if (!issue.resolved) return;
        try {
          const changelog = await jira(route`/rest/api/3/issue/${issue.key}/changelog?maxResults=40`);
          if (!changelog.ok) return;
          const resolver = resolverFromChangelog(changelog.body);
          if (resolver) issue.resolver = resolver;
        } catch {
          // The assignee remains the fallback when history cannot be read.
        }
      }));
      return issues;
    },

    async fetchRunbooks({ cql, siteUrl }) {
      const result = await confluence(route`/wiki/rest/api/search?cql=${cql}&limit=${LIMITS.runbooks}`);
      if (!result.ok) throw fail(result.status, result.body, 'Confluence search failed.');
      return (result.body?.results || []).map((entry) => normalizeConfluenceResult(entry, siteUrl));
    },

    async fetchCode({ workspace, repo, issueKey }) {
      const repository = { workspace, repo };
      const notes = [];
      const commitsResult = await bitbucket(route`/2.0/repositories/${workspace}/${repo}/commits?pagelen=${LIMITS.commits}`);
      if (commitsResult.status === 404) {
        notes.push({
          code: 'bitbucket-repo',
          message: `Bitbucket could not find ${workspace}/${repo}. Save the workspace UUID if the slug is rejected.`,
        });
        return { commits: [], pullRequests: [], deployments: [], notes };
      }
      const commits = commitsResult.ok
        ? (commitsResult.body?.values || []).map((raw) => normalizeCommit(raw, repository))
        : [];
      if (!commitsResult.ok) {
        notes.push({ code: 'bitbucket-commits', message: `Commits were not readable: ${apiMessage(commitsResult.body, commitsResult.status)}` });
      }

      const prioritized = [...commits].sort((left, right) => {
        const leftHit = mentionsIssueKey(left.message, issueKey) ? 1 : 0;
        const rightHit = mentionsIssueKey(right.message, issueKey) ? 1 : 0;
        return rightHit - leftHit;
      });
      await Promise.all(prioritized.slice(0, LIMITS.diffstats).map(async (commit) => {
        if (!commit.id) return;
        try {
          const diff = await bitbucket(route`/2.0/repositories/${workspace}/${repo}/diffstat/${commit.id}?pagelen=20`);
          if (diff.ok) commit.files = pathsFromDiffstat(diff.body);
        } catch {
          // A missing diffstat still leaves the commit message as evidence.
        }
      }));

      const pullRequests = await loadPullRequests(bitbucket, repository, issueKey, notes);
      const pipelines = await bitbucket(route`/2.0/repositories/${workspace}/${repo}/pipelines/?pagelen=${LIMITS.pipelines}&sort=-created_on`);
      const deployments = pipelines.ok
        ? (pipelines.body?.values || []).map((raw) => normalizePipeline(raw, repository))
        : [];
      if (!pipelines.ok) {
        notes.push({ code: 'bitbucket-pipelines', message: `Pipelines were not readable: ${apiMessage(pipelines.body, pipelines.status)}` });
      }
      return { commits, pullRequests, deployments, notes };
    },

    async getRepoHint(projectKey) {
      if (!projectKey) return null;
      try {
        const stored = await kvs.get(repoKey(projectKey));
        return validRepoHint(stored);
      } catch {
        return null;
      }
    },

    async saveRepoHint(projectKey, hint) {
      const valid = validRepoHint(hint);
      if (!projectKey || !valid) {
        const error = new Error('Enter a Bitbucket workspace and repository slug, with no spaces or slashes.');
        error.code = 'invalid-repo';
        throw error;
      }
      await kvs.set(repoKey(projectKey), valid);
      return valid;
    },

    async clearRepoHint(projectKey) {
      if (!projectKey) return;
      await kvs.delete(repoKey(projectKey));
    },
  };
}

async function loadPullRequests(bitbucket, repository, issueKey, notes) {
  const { workspace, repo } = repository;
  const query = `title ~ "${issueKey}" OR description ~ "${issueKey}" OR source.branch.name ~ "${issueKey}"`;
  const queried = await bitbucket(route`/2.0/repositories/${workspace}/${repo}/pullrequests?pagelen=${LIMITS.pullRequests}&q=${query}`);
  let raw = [];
  if (queried.ok) {
    raw = queried.body?.values || [];
  } else {
    notes.push({ code: 'bitbucket-pullrequests', message: `Pull request search was not accepted (${queried.status}). Checked recent open and merged pull requests instead.` });
    const [open, merged] = await Promise.all([
      bitbucket(route`/2.0/repositories/${workspace}/${repo}/pullrequests?pagelen=20&state=OPEN`),
      bitbucket(route`/2.0/repositories/${workspace}/${repo}/pullrequests?pagelen=20&state=MERGED`),
    ]);
    raw = [...(open.body?.values || []), ...(merged.body?.values || [])];
  }
  return raw
    .filter((pullRequest) => mentionsIssueKey(
      `${pullRequest.title || ''} ${pullRequest.description || ''} ${pullRequest.source?.branch?.name || ''}`,
      issueKey,
    ))
    .slice(0, LIMITS.pullRequests)
    .map((pullRequest) => normalizePullRequest(pullRequest, repository));
}
