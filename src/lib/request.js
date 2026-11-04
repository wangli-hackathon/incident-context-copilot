const ISSUE_KEY = /^[A-Z][A-Z0-9_]+-\d+$/i;

export function resolveIssueKey(payload = {}) {
  const url = payload?.context?.jira?.url;
  let fromUrl = null;
  if (typeof url === 'string') {
    const match = url.match(/\/browse\/([A-Z][A-Z0-9_]+-\d+)/i);
    fromUrl = match ? match[1] : null;
  }
  const candidates = [payload.issueKey, payload?.context?.jira?.issueKey, fromUrl];
  for (const value of candidates) {
    if (typeof value === 'string' && ISSUE_KEY.test(value.trim())) {
      return value.trim().toUpperCase();
    }
  }
  return null;
}

export function resolveProjectKey(payload = {}, issueKey) {
  const explicit = payload.projectKey || payload?.context?.jira?.projectKey;
  if (typeof explicit === 'string' && /^[A-Z][A-Z0-9_]+$/i.test(explicit.trim())) {
    return explicit.trim().toUpperCase();
  }
  if (issueKey && issueKey.includes('-')) return issueKey.split('-')[0];
  return null;
}
