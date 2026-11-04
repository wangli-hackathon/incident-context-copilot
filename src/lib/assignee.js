import { clamp } from './text.js';

function personKey(person) {
  if (!person) return null;
  if (person.accountId) return `id:${person.accountId}`;
  if (person.displayName) return `name:${person.displayName.trim().toLowerCase()}`;
  return null;
}

function reasonFor(cause) {
  if (cause.kind === 'commit') return `Authored ${cause.title.toLowerCase()}`;
  if (cause.kind === 'pull-request') return `Authored ${cause.title.toLowerCase()}`;
  if (cause.kind === 'similar-issue') return `Resolved or owned the matching issue behind ${cause.title}`;
  if (cause.kind === 'deployment') return `Associated with ${cause.title.toLowerCase()}`;
  return `Tied to ${cause.title}`;
}

export function suggestAssignee(context, causes) {
  const totals = new Map();
  for (const cause of causes || []) {
    const person = cause.actor;
    const key = personKey(person);
    if (!key) continue;
    const current = totals.get(key) || {
      accountId: person.accountId || null,
      displayName: person.displayName || 'Unknown',
      score: 0,
      reasons: [],
    };
    current.score += cause.confidence;
    current.reasons.push({ text: reasonFor(cause), weight: cause.confidence });
    if (!current.accountId && person.accountId) current.accountId = person.accountId;
    totals.set(key, current);
  }

  const ranked = [...totals.values()].sort((left, right) => right.score - left.score || left.displayName.localeCompare(right.displayName));
  if (!ranked.length) return null;
  const totalScore = ranked.reduce((sum, person) => sum + person.score, 0) || 1;
  const toPublic = (person) => ({
    accountId: person.accountId,
    displayName: person.displayName,
    confidence: clamp((person.score / totalScore) * 100),
    reasons: person.reasons
      .sort((left, right) => right.weight - left.weight)
      .map((reason) => reason.text)
      .filter((text, index, all) => all.indexOf(text) === index)
      .slice(0, 3),
  });
  const [primary, ...rest] = ranked.map(toPublic);
  return { ...primary, alternates: rest.slice(0, 2) };
}
