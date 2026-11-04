import { DEMO_NOW } from './constants.js';

export { DEMO_NOW };

/** Frozen sample so the ranking story does not decay after the hackathon clock moves on. */
export function demoCollected() {
  return {
    repository: { workspace: 'acme', repo: 'payments' },
    notes: [{
      code: 'demo',
      message: 'Sample incident PAY-204. Nothing was read from this site.',
    }],
    issue: {
      key: 'PAY-204',
      id: '100204',
      summary: 'Checkout timeouts after the payments deploy',
      descriptionText: 'TimeoutError in src/checkout/charge.js:88 while calling the provider. HTTP status 504 from the charge service.',
      issueType: 'Bug',
      status: 'In Progress',
      priority: 'Highest',
      labels: ['sev-2'],
      components: ['Payments'],
      assignee: null,
      reporter: { accountId: 'ben', displayName: 'Ben Cho' },
      comments: [{
        author: { accountId: 'ada', displayName: 'Ada Okonkwo' },
        text: 'Provider latency spiked after pipeline 900.',
        at: '2026-11-04T10:00:00.000Z',
      }],
      links: [],
      projectKey: 'PAY',
    },
    commits: [
      {
        id: 'a1b2c3d4e5f67890',
        message: 'PAY-204 hotfix charge timeout',
        url: 'https://bitbucket.org/acme/payments/commits/a1b2c3d4e5f67890',
        at: '2026-11-04T09:00:00.000Z',
        files: ['src/checkout/charge.js'],
        repository: 'acme/payments',
        author: { accountId: 'ada', displayName: 'Ada Okonkwo' },
      },
      {
        id: 'bbbbbbb111111111',
        message: 'Refactor marketing styles',
        url: 'https://bitbucket.org/acme/payments/commits/bbbbbbb111111111',
        at: '2026-10-01T09:00:00.000Z',
        files: ['src/web/theme.css'],
        repository: 'acme/payments',
        author: { accountId: 'ben', displayName: 'Ben Cho' },
      },
    ],
    pullRequests: [
      {
        id: '17',
        title: 'Fix charge timeout',
        state: 'OPEN',
        url: 'https://bitbucket.org/acme/payments/pull-requests/17',
        sourceBranch: 'hotfix/PAY-204-timeout',
        at: '2026-11-04T09:30:00.000Z',
        repository: 'acme/payments',
        author: { accountId: 'ada', displayName: 'Ada Okonkwo' },
      },
    ],
    deployments: [
      {
        id: '900',
        name: 'Pipeline 900',
        environment: 'production',
        state: 'failed',
        url: 'https://bitbucket.org/acme/payments/pipelines/results/900',
        at: '2026-11-04T09:00:00.000Z',
        commitMessage: 'PAY-204 hotfix charge timeout',
        ref: 'main',
        repository: 'acme/payments',
      },
      {
        id: '899',
        name: 'Pipeline 899',
        environment: 'production',
        state: 'successful',
        url: 'https://bitbucket.org/acme/payments/pipelines/results/899',
        at: '2026-11-02T12:00:00.000Z',
        commitMessage: 'Release notes',
        ref: 'main',
        repository: 'acme/payments',
      },
    ],
    runbooks: [
      {
        id: '4421',
        title: 'Payments charge timeout runbook',
        excerpt: 'Raise the provider timeout, then revert the retry loop if checkouts keep returning 504.',
        space: 'Operations',
        url: 'https://acme.atlassian.net/wiki/spaces/OPS/pages/4421/Payments+charge+timeout+runbook',
      },
    ],
    similarIssues: [
      {
        key: 'PAY-118',
        summary: 'Checkout timeouts in the charge service',
        status: 'Done',
        resolved: true,
        resolution: 'TimeoutError in src/checkout/charge.js. Raised the provider timeout and reverted the retry loop after the payments deploy.',
        details: 'Checkout timeouts after a payments deploy. TimeoutError from the charge service.',
        assignee: { accountId: 'priya', displayName: 'Priya Raman' },
        resolver: { accountId: 'priya', displayName: 'Priya Raman' },
        components: ['Payments'],
        labels: ['sev-2'],
        linked: false,
        url: 'https://acme.atlassian.net/browse/PAY-118',
      },
      {
        key: 'PAY-90',
        summary: 'Update the marketing banner copy',
        status: 'Done',
        resolved: true,
        resolution: 'Published the new banner',
        details: 'New headline for the spring campaign.',
        assignee: { accountId: 'ben', displayName: 'Ben Cho' },
        resolver: { accountId: 'ben', displayName: 'Ben Cho' },
        components: ['Marketing'],
        labels: [],
        linked: false,
        url: 'https://acme.atlassian.net/browse/PAY-90',
      },
    ],
  };
}
