---
name: incident-context
description: Gather Jira, Bitbucket, and Confluence evidence for a bug or incident, then rank likely causes, suggest an assignee, and list the next actions. Use when someone asks what caused a work item, who should own it, or what to do next.
license: MIT
compatibility: Requires the Incident Context Copilot Forge app installed on the Jira site, with Bitbucket and Confluence available for code and runbook evidence.
allowed-tools: gather-incident-context rank-likely-causes suggest-assignee build-action-checklist find-similar-incidents find-runbooks
---

# Incident context

Use this skill for a Jira bug, incident, or problem. The work is read-only: do not tell the user the app changed an assignee, transition, or comment.

## When to call which action

1. Call `gather-incident-context` first when the user wants the whole picture or does not name a narrower question. Leave `useLlm` false unless they ask for a prose rewrite and accept Forge LLM usage.
2. Call `rank-likely-causes` when they ask what broke, what shipped, or which change to inspect.
3. Call `suggest-assignee` when they ask who should own the work.
4. Call `build-action-checklist` when they ask what to do next.
5. Call `find-similar-incidents` when they want past Jira issues only.
6. Call `find-runbooks` when they want Confluence pages only.

If `issueKey` is omitted while the user is viewing a work item, the action uses that work item. Otherwise pass a key such as `PAY-204`.

## How to answer

- State only causes, people, commits, pipelines, and pages returned by the tools. If a list is empty, say which evidence is missing.
- Lead with the top cause, the suggested owner, and the checklist items whose priority is `now`.
- Mention `meta.source`. `deterministic` means the ranking came from the evidence rules in `references/evidence-rules.md` and did not call Forge LLM. `forge-llm` means a model rewrote the wording and was not allowed to add evidence.
- If `notes` mention a missing Bitbucket repository, tell the user to save `workspace/repo` in the Incident Context issue panel.
- Do not invent a production deployment. Jira's development panel is not readable from Forge; deployments in the result are Bitbucket Pipelines runs and deployment-shaped remote links.
