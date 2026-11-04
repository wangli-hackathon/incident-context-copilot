import Resolver from '@forge/resolver';
import { runAction } from './analysis/actions.js';
import { buildBrief } from './analysis/buildBrief.js';
import { createForgeClients } from './clients/atlassian.js';
import { completeJson } from './clients/llm.js';
import { LLM_MODEL } from './lib/constants.js';
import { resolveIssueKey, resolveProjectKey } from './lib/request.js';
import { coerceBoolean, publicError } from './lib/text.js';

const resolver = new Resolver();
const panelClients = createForgeClients({ allowAppFallback: true });

function extensionOf(context) {
  return context?.extension || {};
}

resolver.define('getBrief', async ({ payload = {}, context = {} }) => {
  const demo = Boolean(payload.demo);
  const extension = extensionOf(context);
  const issueKey = demo ? null : extension.issue?.key || null;
  const projectKey = extension.project?.key || null;
  if (!demo && !issueKey) {
    return { ok: false, code: 'missing-issue', error: 'Open a Jira work item to gather context.' };
  }
  try {
    const repoHint = demo ? null : await panelClients.getRepoHint(projectKey);
    const useLlm = coerceBoolean(payload.useLlm);
    const brief = await buildBrief({
      demo,
      useLlm,
      issueKey,
      projectKey,
      siteUrl: payload.siteUrl || context.siteUrl || '',
      repoHint,
    }, {
      clients: panelClients,
      completeJson: useLlm ? completeJson : null,
      model: useLlm ? LLM_MODEL : null,
    });
    return { ok: true, brief, repoHint };
  } catch (error) {
    console.log(`getBrief failed status=${error.status || ''} code=${error.code || ''}`);
    return { ok: false, code: error.code || 'brief-failed', error: publicError(error) };
  }
});

resolver.define('getRepoHint', async ({ context = {} }) => {
  const hint = await panelClients.getRepoHint(extensionOf(context).project?.key || null);
  return { ok: true, hint };
});

resolver.define('saveRepoHint', async ({ payload = {}, context = {} }) => {
  try {
    const hint = await panelClients.saveRepoHint(extensionOf(context).project?.key, {
      workspace: payload.workspace,
      repo: payload.repo,
    });
    return { ok: true, hint };
  } catch (error) {
    return { ok: false, code: error.code || 'invalid-repo', error: publicError(error) };
  }
});

resolver.define('clearRepoHint', async ({ context = {} }) => {
  await panelClients.clearRepoHint(extensionOf(context).project?.key);
  return { ok: true, hint: null };
});

export const handler = resolver.getDefinitions();

export async function actionHandler(payload = {}, context = {}) {
  const name = payload?.context?.moduleKey || context?.moduleKey || payload?.action;
  const issueKey = resolveIssueKey(payload);
  const projectKey = resolveProjectKey(payload, issueKey);
  const clients = createForgeClients({ allowAppFallback: false });
  const useLlm = coerceBoolean(payload.useLlm);
  let siteUrl = '';
  try {
    if (typeof payload?.context?.jira?.url === 'string') {
      siteUrl = new URL(payload.context.jira.url).origin;
    }
  } catch {
    siteUrl = '';
  }
  try {
    const repoHint = await clients.getRepoHint(projectKey);
    return await runAction(name, {
      issueKey,
      projectKey,
      useLlm,
      siteUrl,
      repoHint,
    }, {
      clients,
      completeJson: useLlm ? completeJson : null,
      model: useLlm ? LLM_MODEL : null,
    });
  } catch (error) {
    console.log(`action failed name=${name || ''} status=${error.status || ''}`);
    return {
      ok: false,
      action: name || null,
      code: error.code || 'action-failed',
      error: publicError(error),
    };
  }
}
