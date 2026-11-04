import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBrief } from '../src/analysis/buildBrief.js';
import { collect, chooseRepository } from '../src/analysis/collect.js';
import { runAction } from '../src/analysis/actions.js';
import { WEIGHTS } from '../src/lib/constants.js';

test('the sample incident names Ada and keeps the failed deploy first without calling clients', async () => {
  let called = false;
  const brief = await buildBrief({ demo: true }, {
    clients: new Proxy({}, { get: () => () => { called = true; throw new Error('demo must not call clients'); } }),
  });
  assert.equal(called, false);
  assert.equal(brief.meta.source, 'deterministic');
  assert.equal(brief.meta.demo, true);
  assert.equal(brief.issue.key, 'PAY-204');
  assert.equal(brief.causes[0].id, 'deploy:900');
  assert.equal(brief.assignee.accountId, 'ada');
  assert.equal(brief.assignee.displayName, 'Ada Okonkwo');
  assert.ok(brief.assignee.confidence > (brief.assignee.alternates.find((person) => person.accountId === 'priya')?.confidence || 0));
  assert.match(brief.narrative, /PAY-204/);
  assert.match(brief.narrative, /Ada Okonkwo/);
  const ids = brief.checklist.map((entry) => entry.id);
  for (const id of ['impact', 'failed-deploy', 'assign-owner', 'timeline', 'review-commit', 'review-pr', 'open-runbook', 'read-similar']) {
    assert.ok(ids.includes(id), id);
  }
  assert.match(brief.checklist.find((entry) => entry.id === 'assign-owner').title, /Ada Okonkwo/);
  assert.equal(brief.checklist.filter((entry) => entry.priority === 'now').every((entry) => ['impact', 'failed-deploy', 'assign-owner'].includes(entry.id)), true);
});

test('a Forge LLM rewrite can reorder wording but cannot drop or invent a cause', async () => {
  const base = await buildBrief({ demo: true });
  const swapped = [base.causes[1], base.causes[0], ...base.causes.slice(2)];
  const brief = await buildBrief({ demo: true, useLlm: true }, {
    completeJson: async () => JSON.stringify({
      summary: 'PAY-204 is still the hotfix window. The model only rewrote this sentence.',
      causes: [
        ...swapped.map((cause) => ({ id: cause.id, narrative: `${cause.title} remains supported by the fetched evidence.` })),
        { id: 'cause:invented', narrative: 'A database failover that nobody fetched.' },
      ],
      assigneeAccountId: 'not-a-person',
      checklist: [
        { id: 'timeline', title: 'Write the timeline', detail: 'Keep the start time.', priority: 'later' },
      ],
    }),
    model: 'claude-sonnet-4-6',
  });
  assert.equal(brief.meta.source, 'forge-llm');
  assert.deepEqual(brief.causes.map((cause) => cause.id), base.causes.map((cause) => cause.id).reverse().length
    ? [base.causes[1].id, base.causes[0].id, ...base.causes.slice(2).map((cause) => cause.id)]
    : []);
  assert.equal(brief.causes.some((cause) => cause.id === 'cause:invented'), false);
  assert.equal(brief.assignee.accountId, 'ada');
  assert.match(brief.narrative, /PAY-204/);
  assert.ok(brief.checklist.some((entry) => entry.id === 'impact'));
  assert.ok(brief.checklist.some((entry) => entry.id === 'failed-deploy'));
});

test('invalid model output leaves the evidence ranking in place', async () => {
  const brief = await buildBrief({ demo: true, useLlm: true }, {
    completeJson: async () => 'I will not follow the schema.',
  });
  assert.equal(brief.meta.source, 'deterministic');
  assert.match(brief.meta.llmError, /JSON/);
  assert.equal(brief.causes[0].id, 'deploy:900');
});

test('a model failure is reported and the checklist still renders', async () => {
  const brief = await buildBrief({ demo: true, useLlm: true }, {
    completeJson: async () => { throw new Error('quota exceeded'); },
  });
  assert.equal(brief.meta.source, 'deterministic');
  assert.match(brief.meta.llmError, /quota exceeded/);
  assert.ok(brief.checklist.length >= 3);
});

test('collector failures degrade into notes instead of an empty failure', async () => {
  const clients = {
    async fetchIssue() {
      return {
        key: 'PAY-7',
        id: '7',
        summary: 'Checkout timeout in the charge path',
        descriptionText: 'TimeoutError in src/checkout/charge.js while the provider timed out.',
        issueType: 'Bug',
        status: 'Open',
        priority: 'High',
        labels: [],
        components: ['Payments'],
        assignee: null,
        reporter: null,
        comments: [],
        links: [],
        projectKey: 'PAY',
      };
    },
    async fetchRemoteLinks() {
      throw Object.assign(new Error('remote links forbidden'), { status: 403 });
    },
    async fetchSimilar() {
      throw Object.assign(new Error('search unavailable'), { status: 500 });
    },
    async fetchRunbooks() {
      return [{ id: '1', title: 'Charge timeout runbook', excerpt: 'Revert the retry loop.', space: 'Ops', url: 'https://example.test/runbook' }];
    },
    async fetchCode() {
      return { commits: [], pullRequests: [], deployments: [], notes: [] };
    },
  };
  const brief = await buildBrief({
    issueKey: 'PAY-7',
    projectKey: 'PAY',
    repoHint: { workspace: 'acme', repo: 'payments' },
    now: '2026-11-04T12:00:00.000Z',
  }, { clients });
  assert.equal(brief.issue.key, 'PAY-7');
  assert.ok(brief.notes.some((note) => note.code === 'remote-links'));
  assert.ok(brief.notes.some((note) => note.code === 'similar-search'));
  assert.equal(brief.runbooks[0].title, 'Charge timeout runbook');
  assert.ok(brief.causes.some((cause) => cause.kind === 'signature'));
});

test('a missing work item rejects the brief', async () => {
  await assert.rejects(
    () => buildBrief({ issueKey: 'PAY-404' }, {
      clients: { async fetchIssue() { throw new Error('Jira could not read PAY-404.'); }, async fetchRemoteLinks() { return []; } },
    }),
    /PAY-404/,
  );
});

test('Bitbucket links choose the repository that appears most often', () => {
  const chosen = chooseRepository(null, [
    'https://bitbucket.org/acme/payments/pull-requests/17',
    'https://bitbucket.org/acme/other/commits/abc',
    'https://bitbucket.org/acme/payments/commits/def',
  ]);
  assert.deepEqual({ workspace: chosen.workspace, repo: chosen.repo }, { workspace: 'acme', repo: 'payments' });
  const saved = chooseRepository({ workspace: 'uuid', repo: 'payments' }, ['https://bitbucket.org/acme/other/commits/abc']);
  assert.equal(saved.workspace, 'uuid');
});

test('collect asks Bitbucket using a repository parsed from the description', async () => {
  const seen = {};
  const clients = {
    async fetchIssue() {
      return {
        key: 'PAY-8',
        summary: 'Checkout timeout after deploy',
        descriptionText: 'See https://bitbucket.org/acme/payments/pull-requests/4',
        issueType: 'Incident',
        status: 'Open',
        labels: [],
        components: [],
        comments: [],
        links: [],
        projectKey: 'PAY',
        descriptionTextFull: '',
      };
    },
    async fetchRemoteLinks() { return []; },
    async fetchSimilar({ jql }) { seen.jql = jql; return []; },
    async fetchRunbooks({ cql }) { seen.cql = cql; return []; },
    async fetchCode(input) { seen.code = input; return { commits: [], pullRequests: [], deployments: [], notes: [] }; },
  };
  const collected = await collect({ issueKey: 'PAY-8', projectKey: 'PAY' }, clients);
  assert.equal(seen.code.workspace, 'acme');
  assert.equal(seen.code.repo, 'payments');
  assert.match(seen.jql, /PAY-8/);
  assert.match(seen.jql, /text ~/);
  assert.match(seen.cql, /runbook/);
  assert.equal(collected.repository.repo, 'payments');
});

test('actions dispatch the same brief the panel builds', async () => {
  const ranked = await runAction('rank-likely-causes', { issueKey: 'PAY-204', demo: true }, {});
  assert.equal(ranked.ok, true);
  assert.equal(ranked.causes[0].confidence, WEIGHTS.failedDeploy + WEIGHTS.mentionsIssueKey + WEIGHTS.recentHours48 + WEIGHTS.prodEnvironment + WEIGHTS.hotfix);
  const owner = await runAction('suggest-assignee', { issueKey: 'PAY-204', demo: true }, {});
  assert.match(owner.summary, /Ada Okonkwo/);
  const list = await runAction('build-action-checklist', { issueKey: 'PAY-204', demo: true }, {});
  assert.match(list.summary, /now:/);
  const missing = await runAction('gather-incident-context', {}, {});
  assert.equal(missing.ok, false);
  assert.equal(missing.code, 'missing-issue');
  const unknown = await runAction('delete-the-site', { issueKey: 'PAY-1' }, {});
  assert.equal(unknown.ok, false);
});
