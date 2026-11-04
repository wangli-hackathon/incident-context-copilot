import assert from 'node:assert/strict';
import test from 'node:test';
import { adfToText, parseBitbucketUrl, validRepoHint } from '../src/lib/text.js';
import {
  normalizeCommit,
  normalizeJiraIssue,
  normalizePipeline,
  resolverFromChangelog,
} from '../src/lib/normalize.js';
import { buildRunbookCql, buildSimilarIssueJql } from '../src/lib/queries.js';
import { resolveIssueKey, resolveProjectKey } from '../src/lib/request.js';
import { extractSignals } from '../src/lib/signals.js';

test('ADF text keeps code, links, and line breaks', () => {
  const text = adfToText({
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'TimeoutError in ' }, { type: 'text', text: 'src/checkout/charge.js:88' }] },
      { type: 'paragraph', content: [{ type: 'inlineCard', attrs: { url: 'https://bitbucket.org/acme/payments/commits/abc' } }] },
    ],
  });
  assert.match(text, /TimeoutError/);
  assert.match(text, /src\/checkout\/charge.js:88/);
  assert.match(text, /bitbucket\.org\/acme\/payments/);
});

test('signals pull the exception, file, and status out of a report', () => {
  const signals = extractSignals({
    summary: 'Checkout timeouts after the payments deploy',
    text: 'TimeoutError in src/checkout/charge.js:88. HTTP status 504 from the charge service.',
  });
  assert.deepEqual(signals.exceptions, ['TimeoutError']);
  assert.deepEqual(signals.files, ['src/checkout/charge.js']);
  assert.deepEqual(signals.statusCodes, ['504']);
  assert.ok(signals.keywords.includes('checkout'));
  assert.ok(signals.keywords.includes('charge'));
});

test('Jira issue normalization flattens description, links, and the latest comments', () => {
  const issue = normalizeJiraIssue({
    key: 'PAY-1',
    id: 99,
    fields: {
      summary: 'Checkout down',
      description: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Timed out' }] }] },
      issuetype: { name: 'Bug' },
      status: { name: 'Open' },
      priority: { name: 'High' },
      labels: ['sev-1'],
      components: [{ name: 'Payments' }],
      assignee: null,
      reporter: { accountId: 'ben', displayName: 'Ben Cho' },
      project: { key: 'PAY' },
      comment: {
        comments: [
          { author: { accountId: 'ada', displayName: 'Ada Okonkwo' }, body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Looking' }] }] }, created: '2026-11-04T00:00:00.000Z' },
        ],
      },
      issuelinks: [{
        type: { name: 'Relates', outward: 'relates to' },
        outwardIssue: { key: 'PAY-2', fields: { summary: 'Earlier outage', status: { name: 'Done', statusCategory: { name: 'Done' } } } },
      }],
    },
  });
  assert.equal(issue.descriptionText, 'Timed out');
  assert.equal(issue.comments[0].text, 'Looking');
  assert.equal(issue.links[0].key, 'PAY-2');
  assert.equal(issue.links[0].resolved, true);
  assert.equal(issue.reporter.displayName, 'Ben Cho');
});

test('the resolver is the latest person who moved the issue to Done, whatever the page order', () => {
  const resolver = resolverFromChangelog({
    values: [
      { created: '2026-11-02T00:00:00.000Z', author: { accountId: 'old', displayName: 'Old' }, items: [{ field: 'status', toString: 'Done' }] },
      { created: '2026-11-04T00:00:00.000Z', author: { accountId: 'priya', displayName: 'Priya Raman' }, items: [{ field: 'status', toString: 'Done' }] },
    ],
  });
  assert.equal(resolver.accountId, 'priya');
  const reversed = resolverFromChangelog({
    values: [
      { created: '2026-11-04T00:00:00.000Z', author: { accountId: 'priya', displayName: 'Priya Raman' }, items: [{ field: 'status', toString: 'Done' }] },
      { created: '2026-11-01T00:00:00.000Z', author: { accountId: 'old', displayName: 'Old' }, items: [{ field: 'status', toString: 'Done' }] },
    ],
  });
  assert.equal(reversed.accountId, 'priya');
});

test('Bitbucket commits and failed pipelines normalize into the ranker shape', () => {
  const commit = normalizeCommit({
    hash: 'abcdef1234567890',
    message: 'PAY-1 hotfix\nmore',
    date: '2026-11-04T00:00:00+00:00',
    author: { raw: 'Ada Okonkwo <ada@example.com>', user: { display_name: 'Ada Okonkwo', account_id: 'ada' } },
    links: { html: { href: 'https://bitbucket.org/acme/payments/commits/abcdef1234567890' } },
  }, { workspace: 'acme', repo: 'payments' }, ['src/checkout/charge.js']);
  assert.equal(commit.author.accountId, 'ada');
  assert.equal(commit.message, 'PAY-1 hotfix');
  assert.equal(commit.files[0], 'src/checkout/charge.js');

  const pipeline = normalizePipeline({
    build_number: 12,
    created_on: '2026-11-04T00:00:00.000Z',
    state: { name: 'COMPLETED', result: { name: 'FAILED' } },
    target: { ref_name: 'main', commit: { message: 'PAY-1 hotfix' } },
  }, { workspace: 'acme', repo: 'payments' });
  assert.equal(pipeline.state, 'failed');
  assert.equal(pipeline.environment, 'production');
  assert.equal(pipeline.url, 'https://bitbucket.org/acme/payments/pipelines/results/12');
});

test('JQL and CQL stay inside quoted terms and skip a site-wide scan with no words', () => {
  const jql = buildSimilarIssueJql({ projectKey: 'PAY', issueKey: 'PAY-1', terms: ['checkout', 'time"out', 'a'] });
  assert.match(jql, /project = "PAY"/);
  assert.match(jql, /key != "PAY-1"/);
  assert.match(jql, /text ~ "checkout"/);
  assert.doesNotMatch(jql, /text ~ "a"/);
  assert.equal(buildSimilarIssueJql({ terms: [] }), null);
  const cql = buildRunbookCql(['charge', 'timeout']);
  assert.match(cql, /type = page/);
  assert.match(cql, /runbook/);
  assert.match(cql, /text ~ "charge"/);
  assert.equal(buildRunbookCql([]), null);
});

test('action issue keys come from a string input or the browse URL, not a numeric id', () => {
  assert.equal(resolveIssueKey({ issueKey: 'pay-15' }), 'PAY-15');
  assert.equal(resolveIssueKey({
    issueKey: 15,
    context: { jira: { issueKey: 15, url: 'https://acme.atlassian.net/browse/PAY-15?focusedCommentId=1' } },
  }), 'PAY-15');
  assert.equal(resolveIssueKey({ issueKey: 'not a key' }), null);
  assert.equal(resolveProjectKey({ context: { jira: { projectKey: 'pay' } } }, 'OTHER-1'), 'PAY');
  assert.equal(resolveProjectKey({}, 'PAY-15'), 'PAY');
});

test('Bitbucket URLs and saved repository hints reject traversal', () => {
  assert.deepEqual(parseBitbucketUrl('https://bitbucket.org/acme/payments/pull-requests/17'), {
    workspace: 'acme',
    repo: 'payments',
    kind: 'pull-requests',
    objectId: '17',
  });
  assert.equal(parseBitbucketUrl('https://example.com/acme/payments'), null);
  assert.equal(validRepoHint({ workspace: '../etc', repo: 'payments' }), null);
  assert.deepEqual(validRepoHint({ workspace: '{11111111-1111-4111-8111-111111111111}', repo: 'payments' }).repo, 'payments');
});
