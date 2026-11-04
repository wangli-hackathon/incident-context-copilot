import assert from 'node:assert/strict';
import test from 'node:test';
import { DEMO_NOW, MIN_CONFIDENCE, WEIGHTS } from '../src/lib/constants.js';
import { demoCollected } from '../src/lib/demo.js';
import { rankCauses, scoreCommit, scoreDeployment } from '../src/lib/ranking.js';
import { assemble } from '../src/analysis/collect.js';

function demoContext() {
  return assemble(demoCollected(), 'https://acme.atlassian.net');
}

test('demo incident ranks the failed production pipeline ahead of the hotfix commit', () => {
  const causes = rankCauses(demoContext(), { now: DEMO_NOW });
  assert.equal(causes[0].id, 'deploy:900');
  assert.equal(causes[1].id, 'commit:a1b2c3d4e5f67890');
  assert.equal(causes[0].confidence, WEIGHTS.failedDeploy + WEIGHTS.mentionsIssueKey + WEIGHTS.recentHours48 + WEIGHTS.prodEnvironment + WEIGHTS.hotfix);
  assert.equal(causes[1].confidence, WEIGHTS.mentionsIssueKey + WEIGHTS.fileOverlap + WEIGHTS.recentHours48 + WEIGHTS.hotfix);
  assert.equal(causes[0].confidenceLabel, 'High');
  assert.ok(causes.some((cause) => cause.id === 'pr:17'));
  assert.ok(causes.some((cause) => cause.id === 'similar:PAY-118'));
  assert.equal(causes.some((cause) => cause.id === 'commit:bbbbbbb111111111'), false);
  assert.equal(causes.some((cause) => cause.id === 'deploy:899'), false);
  assert.equal(causes.some((cause) => cause.id === 'similar:PAY-90'), false);
  assert.ok(causes.every((cause) => cause.confidence >= MIN_CONFIDENCE));
  assert.deepEqual(causes.map((cause) => cause.rank), causes.map((_, index) => index + 1));
});

test('two commits that touch the same reported file collapse into one cause', () => {
  const context = {
    issue: { key: 'PAY-1', summary: 'Timeout', components: [], labels: [] },
    signals: { files: ['src/checkout/charge.js'], exceptions: ['TimeoutError'] },
    commits: [
      {
        id: 'aaa1111',
        message: 'PAY-1 tweak logging',
        at: '2026-11-04T11:00:00.000Z',
        files: ['src/checkout/charge.js'],
        repository: 'acme/payments',
        author: { accountId: 'ada', displayName: 'Ada Okonkwo' },
        url: 'https://bitbucket.org/acme/payments/commits/aaa1111',
      },
      {
        id: 'ccc3333',
        message: 'PAY-1 hotfix charge timeout',
        at: '2026-11-04T10:00:00.000Z',
        files: ['src/checkout/charge.js'],
        repository: 'acme/payments',
        author: { accountId: 'ada', displayName: 'Ada Okonkwo' },
        url: 'https://bitbucket.org/acme/payments/commits/ccc3333',
      },
    ],
    pullRequests: [],
    deployments: [],
    similarIssues: [],
  };
  const causes = rankCauses(context, { now: DEMO_NOW });
  const clustered = causes.filter((cause) => cause.kind === 'commit');
  assert.equal(clustered.length, 1);
  assert.equal(clustered[0].id, 'commit:ccc3333');
  assert.equal(clustered[0].supporting[0].id, 'commit:aaa1111');
  assert.equal(causes.some((cause) => cause.kind === 'signature'), false);
});

test('a stack signature is the cause when no fetched change touches the file', () => {
  const context = {
    issue: { key: 'PAY-2', summary: 'Boom', components: [], labels: [] },
    signals: { files: ['src/checkout/charge.js'], exceptions: ['TimeoutError'] },
    commits: [],
    pullRequests: [],
    deployments: [],
    similarIssues: [],
  };
  const causes = rankCauses(context, { now: DEMO_NOW });
  assert.equal(causes.length, 1);
  assert.equal(causes[0].kind, 'signature');
  assert.equal(causes[0].confidence, WEIGHTS.signature);
});

test('an empty context produces no causes', () => {
  assert.deepEqual(rankCauses({ issue: { key: 'PAY-3' } }, { now: DEMO_NOW }), []);
});

test('file overlap is insensitive to a leading dot-slash and a line number', () => {
  const scored = scoreCommit({
    id: 'abc1234',
    message: 'unrelated',
    at: '2026-01-01T00:00:00.000Z',
    files: ['./src/checkout/charge.js'],
    repository: 'acme/payments',
    author: { accountId: 'ada', displayName: 'Ada Okonkwo' },
  }, {
    issue: { key: 'PAY-9' },
    signals: { files: ['src/checkout/charge.js:88'], exceptions: [] },
  }, new Date('2026-11-04T12:00:00.000Z').getTime());
  assert.equal(scored.signals.some((item) => item.code === 'file-overlap'), true);
});

test('a successful production pipeline that does not name the issue stays under the threshold', () => {
  const scored = scoreDeployment({
    id: '899',
    name: 'Pipeline 899',
    environment: 'production',
    state: 'successful',
    at: '2026-11-02T12:00:00.000Z',
    commitMessage: 'Release notes',
    ref: 'main',
  }, { issue: { key: 'PAY-204' }, signals: { files: [], exceptions: [] } }, new Date(DEMO_NOW).getTime());
  assert.ok(scored.confidence < MIN_CONFIDENCE);
});
