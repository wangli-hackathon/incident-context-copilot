const STOPWORDS = new Set(`
  a an the and or of to in on for with from after before while this that these those
  into over under than then when where what who how why was were are is be been being
  it its as at by not no yes we our their they them his her you your via per out up
  down off if but so just only also can may has have had will would should could about
  across between during without within using used use new old all any each few more
  most other some such own same too very incident bug issue error errors status http
  code service services after into from with that this
`.split(/\s+/).filter(Boolean));

export function adfToText(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(adfToText).join('');
  if (typeof node !== 'object') return '';
  if (node.type === 'text') return node.text || '';
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'mention') return node.attrs?.text || '';
  if (node.type === 'emoji') return node.attrs?.shortName || '';
  if (node.type === 'inlineCard' || node.type === 'blockCard') return `${node.attrs?.url || ''}\n`;
  const inner = adfToText(node.content || []);
  if (['paragraph', 'heading', 'blockquote', 'codeBlock', 'listItem', 'bulletList', 'orderedList', 'panel', 'tableRow'].includes(node.type)) {
    return `${inner}\n`;
  }
  return inner;
}

export function stripHighlight(value) {
  return String(value || '')
    .replace(/@@@hl@@@/g, '')
    .replace(/@@@endhl@@@/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(value, max) {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

export function unique(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (value == null) continue;
    const key = String(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

export function stem(token) {
  const word = String(token || '').toLowerCase();
  if (word.length > 5 && word.endsWith('s') && !word.endsWith('ss')) {
    return word.slice(0, -1);
  }
  return word;
}

export function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9.+_-]+/)
    .map(stem)
    .filter((token) => token.length >= 4 && !STOPWORDS.has(token));
}

export function tokenSimilarity(left, right) {
  const a = new Set(tokenize(left));
  const b = new Set(tokenize(right));
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function extractUrls(value) {
  return String(value || '').match(/https?:\/\/[^\s<>"')\]]+/g) || [];
}

export function absoluteUrl(value, siteUrl) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (siteUrl && value.startsWith('/')) {
    return `${String(siteUrl).replace(/\/$/, '')}${value}`;
  }
  return value;
}

export function parseBitbucketUrl(value) {
  if (!value || typeof value !== 'string') return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (!/(^|\.)bitbucket\.org$/i.test(url.hostname)) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const workspace = decodeURIComponent(parts[0]);
  const repo = decodeURIComponent(parts[1]).replace(/\.git$/i, '');
  if (!workspace || !repo || workspace.includes('..') || repo.includes('..')) return null;
  return {
    workspace,
    repo,
    kind: parts[2] || null,
    objectId: parts[3] || null,
  };
}

export function normalizePath(value) {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .replace(/:\d+(?::\d+)?$/, '')
    .toLowerCase();
}

export function basename(value) {
  const path = normalizePath(value);
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

export function mentionsIssueKey(value, issueKey) {
  if (!value || !issueKey) return false;
  const escaped = String(issueKey).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(String(value));
}

export function shortHash(value) {
  const text = String(value || '');
  return text.slice(0, 7);
}

export function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function confidenceLabel(score) {
  if (score >= 70) return 'High';
  if (score >= 45) return 'Medium';
  return 'Low';
}

export function recencyWeight(iso, nowMs, weights) {
  if (!iso) return 0;
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return 0;
  const age = nowMs - at;
  if (age < 0 && age > -3600_000) return weights.recentHours48;
  if (age < 0) return 0;
  const hours = age / 3_600_000;
  if (hours < 48) return weights.recentHours48;
  if (hours <= 24 * 7) return weights.recentDays7;
  if (hours <= 24 * 30) return weights.recentDays30;
  return 0;
}

export function safeTerm(value) {
  return stem(String(value || ''))
    .replace(/[^a-z0-9.+_-]/g, '')
    .slice(0, 40);
}

export function escapeJqlPhrase(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function publicError(error) {
  const message = String(error?.message || 'Something went wrong while gathering context.');
  return message.replace(/\s+/g, ' ').slice(0, 240);
}

export function parseJsonObject(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced ? fenced[1] : raw;
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(source.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function coerceBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return /^(true|yes|1)$/i.test(value.trim());
  return false;
}

const IDENTIFIER = /^[A-Za-z0-9{][A-Za-z0-9._\-{}]{0,120}$/;

export function validRepoHint(hint) {
  if (!hint || typeof hint !== 'object') return null;
  const workspace = String(hint.workspace || '').trim();
  const repo = String(hint.repo || '').trim();
  if (!IDENTIFIER.test(workspace) || !IDENTIFIER.test(repo)) return null;
  if (workspace.includes('..') || repo.includes('..')) return null;
  return { workspace, repo };
}
