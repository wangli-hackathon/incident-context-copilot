import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  Checkbox,
  EmptyState,
  Heading,
  HelperMessage,
  Inline,
  Label,
  Link,
  Lozenge,
  ProgressBar,
  SectionMessage,
  Spinner,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
  Textfield,
  useProductContext,
  xcss,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const cardStyle = xcss({
  backgroundColor: 'color.background.neutral',
  padding: 'space.150',
  borderRadius: 'border.radius.100',
});

function confidenceAppearance(label) {
  if (label === 'High') return 'danger';
  if (label === 'Medium') return 'warning';
  return 'default';
}

function priorityAppearance(priority) {
  if (priority === 'now') return 'warning';
  if (priority === 'next') return 'inprogress';
  return 'default';
}

function EvidenceLink({ href, children }) {
  if (!href) return <Text>{children}</Text>;
  return (
    <Text>
      <Link href={href} openNewTab>{children}</Link>
    </Text>
  );
}

function CauseCard({ cause }) {
  return (
    <Box xcss={cardStyle}>
      <Stack space="space.100">
        <Inline space="space.100" alignBlock="center" shouldWrap>
          <Lozenge appearance={confidenceAppearance(cause.confidenceLabel)}>{cause.confidenceLabel}</Lozenge>
          <Text weight="medium">{cause.rank}. {cause.title}</Text>
        </Inline>
        <ProgressBar value={cause.confidence / 100} ariaLabel={`${cause.confidence} out of 100 confidence`} />
        <Text>{cause.summary}</Text>
        {(cause.signals || []).slice(0, 3).map((item) => (
          <Text key={item.code} size="small" color="color.text.subtle">{item.detail}</Text>
        ))}
        {(cause.evidence || []).filter((item) => item.url).map((item) => (
          <EvidenceLink key={item.url} href={item.url}>{item.label}</EvidenceLink>
        ))}
      </Stack>
    </Box>
  );
}

function BriefView({ brief, checked, onToggle }) {
  const owner = brief.assignee;
  return (
    <Stack space="space.200">
      <Text>{brief.narrative}</Text>

      <Heading as="h3" size="xsmall">Likely causes</Heading>
      {brief.causes.length === 0 ? (
        <EmptyState
          header="No cause cleared the evidence bar"
          description="Save the Bitbucket repository for this project, or add a pull request link on the work item, then refresh."
        />
      ) : (
        <Stack space="space.100">
          {brief.causes.map((cause) => <CauseCard key={cause.id} cause={cause} />)}
        </Stack>
      )}

      <Heading as="h3" size="xsmall">Suggested owner</Heading>
      <Box xcss={cardStyle}>
        {owner ? (
          <Stack space="space.075">
            <Inline space="space.100" alignBlock="center">
              <Text weight="medium">{owner.displayName}</Text>
              <Lozenge appearance="inprogress">{owner.confidence}% of the ranked evidence</Lozenge>
            </Inline>
            {(owner.reasons || []).map((reason) => (
              <Text key={reason} size="small">{reason}</Text>
            ))}
            {!owner.accountId ? (
              <HelperMessage>No Atlassian account id was attached to this name, so the panel does not pretend it can assign them.</HelperMessage>
            ) : null}
            {(owner.alternates || []).length ? (
              <Text size="small" color="color.text.subtle">
                Also consider {owner.alternates.map((person) => person.displayName).join(', ')}.
              </Text>
            ) : null}
          </Stack>
        ) : (
          <Text>No code author or past resolver stood out. Pick an owner on the work item.</Text>
        )}
      </Box>

      <Heading as="h3" size="xsmall">Checklist</Heading>
      <Stack space="space.100">
        {brief.checklist.map((entry) => (
          <Inline key={entry.id} space="space.100" alignBlock="start">
            <Checkbox
              isChecked={Boolean(checked[entry.id])}
              onChange={(event) => onToggle(entry.id, Boolean(event.target?.checked))}
              label={entry.title}
            />
            <Lozenge appearance={priorityAppearance(entry.priority)}>{entry.priority}</Lozenge>
          </Inline>
        ))}
      </Stack>

      <Tabs id="incident-evidence">
        <TabList>
          <Tab>Code ({brief.counts.commits + brief.counts.pullRequests})</Tab>
          <Tab>Deploys ({brief.counts.deployments})</Tab>
          <Tab>Runbooks ({brief.counts.runbooks})</Tab>
          <Tab>Similar ({brief.counts.similarIssues})</Tab>
        </TabList>
        <TabPanel>
          <Stack space="space.100">
            {brief.repository ? (
              <Text size="small" color="color.text.subtle">
                Repository {brief.repository.workspace}/{brief.repository.repo}. Checked {brief.counts.commits} recent commits.
              </Text>
            ) : (
              <Text size="small">No repository yet. Add one below, or paste a Bitbucket link on the work item.</Text>
            )}
            {brief.pullRequests.map((pullRequest) => (
              <EvidenceLink key={pullRequest.id} href={pullRequest.url}>
                {pullRequest.state} #{pullRequest.id} {pullRequest.title}
              </EvidenceLink>
            ))}
            {brief.commits.slice(0, 8).map((commit) => (
              <EvidenceLink key={commit.id} href={commit.url}>
                {(commit.id || '').slice(0, 7)} {commit.message}
              </EvidenceLink>
            ))}
            {brief.commits.length === 0 && brief.pullRequests.length === 0 ? (
              <Text>No commits or pull requests were read.</Text>
            ) : null}
          </Stack>
        </TabPanel>
        <TabPanel>
          <Stack space="space.100">
            {brief.deployments.length === 0 ? <Text>No pipeline runs or deployment links were read.</Text> : null}
            {brief.deployments.map((deployment) => (
              <Stack key={deployment.id} space="space.025">
                <EvidenceLink href={deployment.url}>
                  {deployment.state} {deployment.environment} {deployment.name}
                </EvidenceLink>
                {deployment.commitMessage ? <Text size="small" color="color.text.subtle">{deployment.commitMessage}</Text> : null}
              </Stack>
            ))}
          </Stack>
        </TabPanel>
        <TabPanel>
          <Stack space="space.100">
            {brief.runbooks.length === 0 ? <Text>No Confluence runbook matched the words in this work item.</Text> : null}
            {brief.runbooks.map((page) => (
              <Stack key={page.id} space="space.025">
                <EvidenceLink href={page.url}>{page.title}</EvidenceLink>
                {page.excerpt ? <Text size="small" color="color.text.subtle">{page.excerpt}</Text> : null}
              </Stack>
            ))}
          </Stack>
        </TabPanel>
        <TabPanel>
          <Stack space="space.100">
            {brief.similarIssues.length === 0 ? <Text>No similar issues were returned.</Text> : null}
            {brief.similarIssues.map((issue) => (
              <Stack key={issue.key} space="space.025">
                <EvidenceLink href={issue.url}>
                  {issue.key} {issue.summary}
                </EvidenceLink>
                <Text size="small" color="color.text.subtle">
                  {Math.round((issue.similarity || 0) * 100)}% term overlap
                  {issue.resolved ? ' · resolved' : ''}
                  {issue.assignee?.displayName ? ` · ${issue.assignee.displayName}` : ''}
                </Text>
              </Stack>
            ))}
          </Stack>
        </TabPanel>
      </Tabs>
    </Stack>
  );
}

const App = () => {
  const context = useProductContext();
  const [brief, setBrief] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [useLlm, setUseLlm] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [checked, setChecked] = useState({});
  const [workspace, setWorkspace] = useState('');
  const [repo, setRepo] = useState('');
  const [saving, setSaving] = useState(false);
  const [repoMessage, setRepoMessage] = useState('');

  const ready = Boolean(context);
  const issueKey = context?.extension?.issue?.key;
  const projectKey = context?.extension?.project?.key;
  const siteUrl = context?.siteUrl || '';
  const liveType = context?.extension?.issue?.type || '';

  useEffect(() => {
    if (!projectKey) return undefined;
    let cancelled = false;
    invoke('getRepoHint').then((result) => {
      if (cancelled || !result?.ok || !result.hint) return;
      setWorkspace(result.hint.workspace);
      setRepo(result.hint.repo);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectKey]);

  useEffect(() => {
    if (!ready) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');
    setBrief(null);
    invoke('getBrief', { demo: demoMode, useLlm, siteUrl })
      .then((result) => {
        if (cancelled) return;
        if (!result?.ok) {
          setError(result?.error || 'Context could not be gathered.');
          return;
        }
        setBrief(result.brief);
        setChecked({});
      })
      .catch(() => {
        if (!cancelled) setError('The panel could not reach the resolver. Refresh the work item and try again.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, issueKey, demoMode, useLlm, refreshToken, siteUrl]);

  const saveRepo = async () => {
    setSaving(true);
    setRepoMessage('');
    try {
      const result = await invoke('saveRepoHint', { workspace, repo });
      if (!result?.ok) {
        setRepoMessage(result?.error || 'Could not save the repository.');
      } else {
        setRepoMessage(`Saved ${result.hint.workspace}/${result.hint.repo} for this project.`);
        setRefreshToken((value) => value + 1);
      }
    } catch {
      setRepoMessage('Could not save the repository.');
    } finally {
      setSaving(false);
    }
  };

  const clearRepo = async () => {
    setSaving(true);
    setRepoMessage('');
    try {
      const result = await invoke('clearRepoHint');
      if (!result?.ok) {
        setRepoMessage(result?.error || 'Could not clear the repository.');
      } else {
        setWorkspace('');
        setRepo('');
        setRepoMessage('Cleared the saved repository.');
        setRefreshToken((value) => value + 1);
      }
    } catch {
      setRepoMessage('Could not clear the repository.');
    } finally {
      setSaving(false);
    }
  };

  if (!context) {
    return (
      <Inline space="space.100" alignBlock="center">
        <Spinner label="Opening the work item" />
        <Text>Opening the work item.</Text>
      </Inline>
    );
  }

  const incidentShaped = /bug|incident|problem/i.test(liveType);
  const sourceLabel = brief?.meta?.source === 'forge-llm' ? 'Forge LLM' : 'Evidence ranking';

  return (
    <Stack space="space.200">
      <Inline spread="space-between" alignBlock="center" shouldWrap>
        <Heading size="small">Incident Context Copilot</Heading>
        <Inline space="space.050" alignBlock="center" shouldWrap>
          {brief ? <Lozenge appearance={brief.meta.source === 'forge-llm' ? 'discovery' : 'inprogress'}>{sourceLabel}</Lozenge> : null}
          {brief?.meta?.demo ? <Lozenge appearance="new">Sample</Lozenge> : null}
        </Inline>
      </Inline>
      <Text size="small" color="color.text.subtle">
        {demoMode ? 'Sample incident PAY-204' : (issueKey || 'This work item')}
        {liveType ? ` · ${liveType}` : ''}
        . Read-only. Nothing here assigns or edits the work item.
      </Text>

      {!demoMode && liveType && !incidentShaped ? (
        <SectionMessage appearance="information" title="Tuned for bugs and incidents">
          <Text>This work item is a {liveType}. The same evidence rules still run.</Text>
        </SectionMessage>
      ) : null}

      <Inline space="space.100" alignBlock="center" shouldWrap>
        <Button appearance="subtle" isDisabled={loading} onClick={() => setRefreshToken((value) => value + 1)}>
          Refresh
        </Button>
        <Button appearance={useLlm ? 'warning' : 'primary'} isDisabled={loading} onClick={() => setUseLlm((value) => !value)}>
          {useLlm ? 'Use evidence ranking only' : 'Enhance with Forge LLM'}
        </Button>
        <Button appearance="subtle" isDisabled={loading} onClick={() => setDemoMode((value) => !value)}>
          {demoMode ? 'Analyze this work item' : 'Load sample incident'}
        </Button>
        {loading ? <Spinner label="Gathering context" /> : null}
      </Inline>

      {error ? (
        <SectionMessage appearance="error" title="Context was not gathered">
          <Text>{error}</Text>
        </SectionMessage>
      ) : null}

      {brief?.meta?.demo ? (
        <SectionMessage appearance="discovery" title="Sample data">
          <Text>PAY-204 is a frozen incident so the story stays stable without a connected repository. Switch back to analyze the work item you have open.</Text>
        </SectionMessage>
      ) : null}

      {brief?.meta?.llmError ? (
        <SectionMessage appearance="warning" title="Forge LLM was not used">
          <Text>{brief.meta.llmError}</Text>
        </SectionMessage>
      ) : null}

      {(brief?.notes || []).length ? (
        <SectionMessage appearance="warning" title="Some sources did not respond">
          <Stack space="space.050">
            {brief.notes.map((note) => <Text key={`${note.code}-${note.message}`}>{note.message}</Text>)}
          </Stack>
        </SectionMessage>
      ) : null}

      {!brief && loading ? <Text>Gathering commits, pipelines, runbooks, and similar issues.</Text> : null}
      {brief ? (
        <BriefView
          brief={brief}
          checked={checked}
          onToggle={(id, value) => setChecked((current) => ({ ...current, [id]: value }))}
        />
      ) : null}

      <Heading as="h3" size="xsmall">Bitbucket repository</Heading>
      <Text size="small">
        Forge cannot read Jira’s development panel. Save the repository that ships this service. A link already on the work item is used when this is empty.
      </Text>
      <Label labelFor="icc-workspace">Workspace</Label>
      <Textfield
        id="icc-workspace"
        value={workspace}
        placeholder="acme or workspace UUID"
        onChange={(event) => setWorkspace(event.target.value || '')}
      />
      <Label labelFor="icc-repo">Repository</Label>
      <Textfield
        id="icc-repo"
        value={repo}
        placeholder="payments"
        onChange={(event) => setRepo(event.target.value || '')}
      />
      <HelperMessage>Use the slug from bitbucket.org/workspace/repository. If Bitbucket returns 404, paste the workspace UUID.</HelperMessage>
      <Inline space="space.100">
        <Button appearance="primary" isDisabled={saving} onClick={saveRepo}>Save repository</Button>
        <Button appearance="subtle" isDisabled={saving} onClick={clearRepo}>Clear</Button>
      </Inline>
      {repoMessage ? <Text>{repoMessage}</Text> : null}
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
