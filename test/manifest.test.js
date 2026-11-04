import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { load as loadYaml } from 'js-yaml';
import { ACTION_KEYS } from '../src/lib/constants.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = loadYaml(readFileSync(path.join(root, 'manifest.yml'), 'utf8'));
const skill = readFileSync(path.join(root, 'skills/incident-context/SKILL.md'), 'utf8');

test('the manifest wires the panel, agent, skill, MCP tools, and Forge LLM', () => {
  assert.equal(manifest.modules['jira:issuePanel'][0].key, 'incident-context-panel');
  assert.equal(manifest.modules['jira:issuePanel'][0].render, 'native');
  assert.equal(manifest.modules['jira:issuePanel'][0].resolver.function, 'resolver');
  assert.equal(manifest.modules['rovo:agent'][0].name, 'Incident Context Copilot');
  assert.ok(manifest.modules['rovo:agent'][0].name.length <= 30);
  assert.deepEqual(manifest.modules['rovo:agent'][0].actions, ACTION_KEYS);
  assert.deepEqual(manifest.modules['rovo:agent'][0].skills, ['incident-context']);
  assert.equal(manifest.modules['rovo:mcp'].length, 1);
  assert.ok(manifest.modules['rovo:mcp'][0].name.length <= 30);
  assert.deepEqual(manifest.modules['rovo:mcp'][0].tools, ACTION_KEYS);
  assert.deepEqual(manifest.modules['rovo:skill'][0].dependencies.tools, ACTION_KEYS);
  assert.equal(manifest.modules['rovo:skill'][0].source.dir, 'skills/incident-context');
  assert.deepEqual(manifest.modules.llm[0].model, ['claude']);
  assert.equal(manifest.app.runtime.name, 'nodejs24.x');
  assert.match(manifest.app.id, /^ari:cloud:ecosystem::app\/[0-9a-f-]{36}$/);
});

test('every action is read-only and points at the shared handler', () => {
  const actions = manifest.modules.action;
  assert.deepEqual(actions.map((action) => action.key), ACTION_KEYS);
  for (const action of actions) {
    assert.equal(action.actionVerb, 'GET');
    assert.equal(action.function, 'actions');
    assert.equal(typeof action.description, 'string');
    assert.equal(action.inputs.issueKey.type, 'string');
    assert.equal(action.inputs.issueKey.required, false);
  }
  const handlers = Object.fromEntries(manifest.modules.function.map((entry) => [entry.key, entry.handler]));
  assert.equal(handlers.resolver, 'index.handler');
  assert.equal(handlers.actions, 'index.actionHandler');
});

test('scopes stay read-only and include Jira, Confluence, Bitbucket, and storage', () => {
  const scopes = manifest.permissions.scopes;
  for (const scope of [
    'storage:app',
    'read:jira-work',
    'read:jira-user',
    'search:confluence',
    'read:page:confluence',
    'read:repository:bitbucket',
    'read:pullrequest:bitbucket',
    'read:pipeline:bitbucket',
  ]) {
    assert.ok(scopes.includes(scope), scope);
  }
  assert.equal(scopes.some((scope) => scope.startsWith('write:') || scope.startsWith('delete:')), false);
});

test('the skill name matches its directory and lists every tool', () => {
  assert.match(skill, /^---\nname: incident-context\n/);
  const description = skill.match(/description: (.+)\n/)[1];
  assert.ok(description.length >= 50);
  const allowed = skill.match(/allowed-tools: (.+)\n/)[1].split(/\s+/);
  assert.deepEqual(allowed, ACTION_KEYS);
});
