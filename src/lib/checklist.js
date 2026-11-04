import { LIMITS } from './constants.js';

function item(id, priority, title, detail) {
  return { id, priority, title, detail };
}

export function buildChecklist(context, causes, assignee) {
  const issue = context.issue || {};
  const items = [
    item(
      'impact',
      'now',
      'Confirm who is affected and whether the workaround holds',
      'Write down the customer impact, the start time, and the current workaround before changing code.',
    ),
  ];

  const top = causes?.[0];
  const failed = (causes || []).find((cause) => cause.kind === 'deployment' && /fail|stopped/i.test(`${cause.title} ${cause.summary}`));
  if (failed) {
    items.push(item(
      'failed-deploy',
      'now',
      `Inspect ${failed.title.toLowerCase()} before redeploying`,
      failed.summary,
    ));
  } else if (top) {
    items.push(item(
      'top-evidence',
      'now',
      `Review the leading clue: ${top.title}`,
      top.summary,
    ));
  }

  const current = issue.assignee;
  if (assignee && (!current || current.accountId !== assignee.accountId)) {
    const sameName = current && !current.accountId && current.displayName === assignee.displayName;
    if (!current) {
      items.push(item(
        'assign-owner',
        'now',
        `Assign ${assignee.displayName}`,
        assignee.reasons?.[0] || 'This person is the strongest match in the code and in similar resolved work.',
      ));
    } else if (!sameName) {
      items.push(item(
        'reassign-owner',
        'now',
        `Hand this to ${assignee.displayName}`,
        `${current.displayName || 'The current assignee'} is not the person the code and past incidents point to. ${assignee.reasons?.[0] || ''}`.trim(),
      ));
    }
  } else if (assignee && current) {
    items.push(item(
      'confirm-owner',
      'next',
      `Confirm ${assignee.displayName} still owns the response`,
      'The current assignee matches the code and past-incident evidence.',
    ));
  } else if (!current) {
    items.push(item(
      'assign-owner',
      'now',
      'Pick an owner and acknowledge the incident',
      'No code author or past resolver stood out. Choose someone who can drive the next update.',
    ));
  }

  items.push(item(
    'timeline',
    'next',
    'Record the timeline on the work item',
    'Note the first report, the last production change, and the mitigation in a comment so the next responder does not reconstruct it.',
  ));

  const commit = (causes || []).find((cause) => cause.kind === 'commit');
  if (commit) {
    items.push(item('review-commit', 'next', `Review ${commit.title.toLowerCase()}`, 'Decide whether to revert it or fix forward. Quote the commit in the work item.'));
  }
  const pullRequest = (causes || []).find((cause) => cause.kind === 'pull-request');
  if (pullRequest) {
    items.push(item('review-pr', 'next', `Decide what to do with ${pullRequest.title.toLowerCase()}`, 'Merge, fix forward, or decline it. Do not leave an open hotfix beside a second change.'));
  }
  const runbook = context.runbooks?.[0];
  if (runbook) {
    items.push(item('open-runbook', 'next', `Follow “${runbook.title}”`, runbook.excerpt || 'Open the runbook and execute the mitigation section before inventing a new one.'));
  }
  const similar = (causes || []).find((cause) => cause.kind === 'similar-issue');
  if (similar) {
    items.push(item('read-similar', 'next', `Read the resolution behind ${similar.title}`, similar.summary));
  }
  if ((context.signals?.files || []).length && !commit) {
    items.push(item(
      'inspect-frame',
      'next',
      `Open ${context.signals.files[0]} at the top of the stack`,
      'The report names this file and no fetched commit explains it yet.',
    ));
  }

  const order = { now: 0, next: 1, later: 2 };
  return items
    .filter((entry, index, all) => all.findIndex((other) => other.id === entry.id) === index)
    .sort((left, right) => order[left.priority] - order[right.priority] || left.id.localeCompare(right.id))
    .slice(0, LIMITS.checklist);
}
