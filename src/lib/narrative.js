export function renderNarrative({ context, causes, assignee }) {
  const key = context.issue?.key || 'This work item';
  if (!causes?.length) {
    return `${key} has no ranked cause yet. Link a Bitbucket repository or a pull request, then refresh. The checklist still covers impact and ownership.`;
  }
  const top = causes[0];
  const owner = assignee
    ? `Suggested owner: ${assignee.displayName}. ${assignee.reasons?.[0] || ''}`.trim()
    : 'No owner stands out from the code or from similar resolved work.';
  const next = causes.slice(1, 3).map((cause) => cause.title).join('; ');
  const also = next ? ` Also consider ${next}.` : '';
  return `${key}: most likely ${top.title} (${top.confidenceLabel.toLowerCase()} confidence, ${top.confidence}). ${top.summary}${also} ${owner}`;
}
