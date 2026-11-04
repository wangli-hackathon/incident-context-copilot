import {
  HOTFIX_PATTERN,
  LIMITS,
  MIN_CONFIDENCE,
  SIMILARITY_WEIGHT,
  WEIGHTS,
} from './constants.js';
import { overlappingFiles } from './signals.js';
import {
  clamp,
  confidenceLabel,
  mentionsIssueKey,
  recencyWeight,
  shortHash,
  truncate,
} from './text.js';

function signal(code, detail, weight) {
  return { code, detail, weight };
}

function sum(signals) {
  return signals.reduce((total, item) => total + item.weight, 0);
}

function issueBlob(context) {
  const issue = context.issue || {};
  return [issue.summary, issue.descriptionText, ...(issue.comments || []).map((comment) => comment.text)]
    .filter(Boolean)
    .join('\n');
}

function namesException(value, exceptions) {
  return (exceptions || []).some((name) => value && String(value).includes(name));
}

function sameNames(left = [], right = []) {
  const wanted = new Set((right || []).map((name) => String(name).toLowerCase()));
  return (left || []).filter((name) => wanted.has(String(name).toLowerCase()));
}

export function scoreCommit(commit, context, nowMs) {
  const signals = [];
  const blob = `${commit.message || ''} ${(commit.files || []).join(' ')}`;
  const overlap = overlappingFiles(commit.files || [], context.signals?.files || []);
  if (mentionsIssueKey(blob, context.issue?.key)) {
    signals.push(signal('mentions-key', `Names ${context.issue.key}`, WEIGHTS.mentionsIssueKey));
  }
  if (overlap.length) {
    signals.push(signal('file-overlap', `Touches ${overlap.slice(0, 2).join(', ')}`, WEIGHTS.fileOverlap));
  }
  if (namesException(blob, context.signals?.exceptions)) {
    signals.push(signal('exception', 'Names an exception from the work item', WEIGHTS.exceptionInMessage));
  }
  const recent = recencyWeight(commit.at, nowMs, WEIGHTS);
  if (recent) signals.push(signal('recency', 'Landed recently', recent));
  if (HOTFIX_PATTERN.test(commit.message || '')) {
    signals.push(signal('hotfix', 'Described as a hotfix or rollback', WEIGHTS.hotfix));
  }
  const fileLabel = overlap[0] || commit.files?.[0];
  const title = fileLabel
    ? `Commit ${shortHash(commit.id)} touches ${fileLabel}`
    : `Commit ${shortHash(commit.id)} on ${commit.repository || 'the repo'}`;
  return {
    id: `commit:${commit.id}`,
    kind: 'commit',
    cluster: overlap[0] ? `commit:${overlap[0].toLowerCase()}` : `commit:${commit.id}`,
    title: truncate(title, 90),
    summary: commitSummary(commit, overlap),
    confidence: clamp(sum(signals)),
    signals,
    evidence: [{ label: shortHash(commit.id), url: commit.url || null }],
    actor: commit.author || null,
    supporting: [],
  };
}

function commitSummary(commit, overlap) {
  const who = commit.author?.displayName || 'Someone';
  const where = overlap.length ? overlap.slice(0, 2).join(', ') : 'the repository';
  const message = truncate(commit.message || 'no message', 140);
  return `${who} changed ${where} in ${commit.repository || 'the linked repository'}. ${shortHash(commit.id)} says “${message}”.`;
}

export function scorePullRequest(pullRequest, context, nowMs) {
  const signals = [];
  const blob = `${pullRequest.title || ''} ${pullRequest.sourceBranch || ''}`;
  if (mentionsIssueKey(blob, context.issue?.key)) {
    signals.push(signal('mentions-key', `Names ${context.issue.key}`, WEIGHTS.mentionsIssueKey));
  }
  const state = String(pullRequest.state || '').toUpperCase();
  if (state === 'OPEN') signals.push(signal('open-pr', 'Pull request is still open', WEIGHTS.openPullRequest));
  if (state === 'MERGED') signals.push(signal('merged-pr', 'Pull request has merged', WEIGHTS.mergedPullRequest));
  const recent = recencyWeight(pullRequest.at, nowMs, WEIGHTS);
  if (recent) signals.push(signal('recency', 'Updated recently', recent));
  if (HOTFIX_PATTERN.test(blob)) {
    signals.push(signal('hotfix', 'Branch or title describes a hotfix or rollback', WEIGHTS.hotfix));
  }
  const label = state === 'OPEN' ? 'Open' : state === 'MERGED' ? 'Merged' : 'Pull request';
  return {
    id: `pr:${pullRequest.id}`,
    kind: 'pull-request',
    cluster: `pr:${pullRequest.id}`,
    title: truncate(`${label} pull request #${pullRequest.id}`, 90),
    summary: `${pullRequest.author?.displayName || 'Someone'} ${state === 'MERGED' ? 'merged' : 'opened'} “${truncate(pullRequest.title || 'a pull request', 120)}”${pullRequest.sourceBranch ? ` from ${pullRequest.sourceBranch}` : ''}.`,
    confidence: clamp(sum(signals)),
    signals,
    evidence: [{ label: `#${pullRequest.id}`, url: pullRequest.url || null }],
    actor: pullRequest.author || null,
    supporting: [],
  };
}

export function scoreDeployment(deployment, context, nowMs) {
  const signals = [];
  const blob = `${deployment.name || ''} ${deployment.commitMessage || ''} ${deployment.ref || ''}`;
  if (mentionsIssueKey(blob, context.issue?.key)) {
    signals.push(signal('mentions-key', `Ships a change that names ${context.issue.key}`, WEIGHTS.mentionsIssueKey));
  }
  if (deployment.state === 'failed' || deployment.state === 'stopped') {
    signals.push(signal('failed-deploy', `${deployment.name} ${deployment.state}`, WEIGHTS.failedDeploy));
  }
  if (deployment.environment === 'production') {
    signals.push(signal('production', 'Targets production', WEIGHTS.prodEnvironment));
  }
  const recent = recencyWeight(deployment.at, nowMs, WEIGHTS);
  if (recent) signals.push(signal('recency', 'Ran recently', recent));
  if (HOTFIX_PATTERN.test(blob)) {
    signals.push(signal('hotfix', 'Ships a hotfix or rollback', WEIGHTS.hotfix));
  }
  const stateWord = deployment.state === 'failed' ? 'Failed' : deployment.state === 'successful' ? 'Successful' : 'Recent';
  const environment = deployment.environment || 'unknown';
  return {
    id: `deploy:${deployment.id}`,
    kind: 'deployment',
    cluster: `deploy:${deployment.id}`,
    title: truncate(`${stateWord} ${environment} ${deployment.name}`, 90),
    summary: `${deployment.name} on ${deployment.ref || environment} ${deployment.state || 'finished'}${deployment.commitMessage ? `. Commit message: “${truncate(deployment.commitMessage, 140)}”` : ''}.`,
    confidence: clamp(sum(signals)),
    signals,
    evidence: [{ label: deployment.name, url: deployment.url || null }],
    actor: null,
    supporting: [],
  };
}

export function scoreSimilarIssue(similar, context) {
  const similarity = Number.isFinite(similar.similarity) ? similar.similarity : 0;
  if (similarity < 0.08 && !similar.linked) return null;
  const signals = [];
  const fromText = Math.round(similarity * SIMILARITY_WEIGHT);
  if (fromText) {
    signals.push(signal('text-overlap', `${Math.round(similarity * 100)}% term overlap with this report`, fromText));
  }
  signals.push(signal(
    similar.resolved ? 'resolved' : 'open-history',
    similar.resolved ? `${similar.key} is already resolved` : `${similar.key} is still open`,
    similar.resolved ? WEIGHTS.similarResolved : WEIGHTS.similarOpen,
  ));
  const components = sameNames(similar.components, context.issue?.components);
  if (components.length) {
    signals.push(signal('component', `Shares ${components.join(', ')}`, WEIGHTS.componentOverlap));
  }
  const labels = sameNames(similar.labels, context.issue?.labels);
  if (labels.length) signals.push(signal('label', `Shares ${labels.join(', ')}`, WEIGHTS.labelOverlap));
  if (similar.linked) signals.push(signal('linked', `Linked from ${context.issue?.key}`, WEIGHTS.linkedIssue));
  const actor = similar.resolver || similar.assignee || null;
  return {
    id: `similar:${similar.key}`,
    kind: 'similar-issue',
    cluster: `similar:${similar.key}`,
    title: truncate(`${similar.resolved ? 'Resolved' : 'Earlier'} ${similar.key} matches this report`, 90),
    summary: `${similar.key} “${truncate(similar.summary || '', 120)}”${similar.resolution ? `. Resolution: ${truncate(similar.resolution, 160)}` : ''}`,
    confidence: clamp(sum(signals)),
    signals,
    evidence: [{ label: similar.key, url: similar.url || null }],
    actor,
    supporting: [],
  };
}

export function scoreSignature(context) {
  const file = context.signals?.files?.[0];
  const exception = context.signals?.exceptions?.[0];
  if (!file || !exception) return null;
  const covered = [...(context.commits || []), ...(context.pullRequests || [])].some((item) => {
    const files = item.files || [];
    return overlappingFiles(files, [file]).length > 0;
  });
  if (covered) return null;
  return {
    id: `signature:${file}`,
    kind: 'signature',
    cluster: `signature:${file.toLowerCase()}`,
    title: truncate(`${exception} in ${file}`, 90),
    summary: `The work item names ${exception} at ${file}. None of the fetched commits or pull requests touch that file yet.`,
    confidence: WEIGHTS.signature,
    signals: [signal('signature', `${exception} named beside ${file}`, WEIGHTS.signature)],
    evidence: [],
    actor: null,
    supporting: [],
  };
}

export function clusterCauses(causes) {
  const groups = new Map();
  for (const cause of causes) {
    const key = cause.cluster || cause.id;
    const copy = { ...cause, supporting: [...(cause.supporting || [])] };
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, copy);
      continue;
    }
    if (copy.confidence > existing.confidence) {
      copy.supporting = [
        ...copy.supporting,
        { id: existing.id, title: existing.title },
        ...existing.supporting,
      ];
      groups.set(key, copy);
    } else {
      existing.supporting = [...existing.supporting, { id: copy.id, title: copy.title }];
    }
  }
  return [...groups.values()];
}

export function rankCauses(context, options = {}) {
  const nowMs = new Date(options.now || Date.now()).getTime();
  const scored = [
    ...(context.commits || []).map((commit) => scoreCommit(commit, context, nowMs)),
    ...(context.pullRequests || []).map((pullRequest) => scorePullRequest(pullRequest, context, nowMs)),
    ...(context.deployments || []).map((deployment) => scoreDeployment(deployment, context, nowMs)),
    ...(context.similarIssues || []).map((similar) => scoreSimilarIssue(similar, context)).filter(Boolean),
  ];
  const signature = scoreSignature(context);
  if (signature) scored.push(signature);
  return clusterCauses(scored)
    .filter((cause) => cause.confidence >= MIN_CONFIDENCE)
    .sort((left, right) => right.confidence - left.confidence || left.id.localeCompare(right.id))
    .slice(0, LIMITS.causes)
    .map((cause, index) => ({
      id: cause.id,
      rank: index + 1,
      kind: cause.kind,
      title: cause.title,
      summary: cause.summary,
      confidence: cause.confidence,
      confidenceLabel: confidenceLabel(cause.confidence),
      signals: [...cause.signals].sort((left, right) => right.weight - left.weight),
      evidence: cause.evidence,
      supporting: cause.supporting,
      actor: cause.actor,
    }));
}
