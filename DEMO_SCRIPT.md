# Demo script

Target: under three minutes. Record a Jira bug the viewer can edit. Have one Bitbucket repository saved on the project before you hit record, or use **Load sample incident** and say that the data is a frozen example. Leave **Enhance with Forge LLM** off unless you have already confirmed a successful call. The evidence ranking is the demo.

Speak in short sentences. Do not read the checklist aloud in full.

## 0:00–0:20 — The problem

On camera: a Jira bug, **Checkout timeouts after the payments deploy**.

> "The stack is in the description. The deploy is somewhere else. The runbook is a search. The person who fixed this last time is on an old ticket. I need those in one place before I change anything."

Click the **Incident Context** button. It sits with the other issue actions. Only Bug, Incident, Problem, and [System] Incident show it.

## 0:20–1:05 — Causes, owner, checklist

The panel loads. Point at the source lozenge: **Evidence ranking**.

> "This did not call a model. It scored what it could fetch."

Point at the top cause: the failed production pipeline.

> "Pipeline 900 failed on main, and the commit message names this bug. That ranks above the hotfix commit, which touches charge.js, the file in the stack."

Point at the suggested owner.

> "Ada authored that commit and the open pull request. Priya resolved a similar incident. Ada carries more of the evidence, so she is the suggestion. The app does not assign her."

Point at the three **now** items: impact, the failed pipeline, assign Ada.

## 1:05–1:40 — The evidence tabs

Open **Code**, **Deploys**, **Runbooks**, and **Similar**.

> "The open pull request is still unmerged. The runbook says to raise the provider timeout, then revert the retry loop. PAY-118 is the resolved twin. A marketing ticket that only shared the project did not make the list."

If you are on the sample, say so in one line:

> "This is the sample incident, so the story is stable even if this site has no Bitbucket history. The live path is the same panel with the repository saved here."

Gesture at the workspace and repository fields. Do not spend the minute typing unless you already saved them.

## 1:40–2:05 — Confidence when the model is absent

Toggle **Enhance with Forge LLM** only if you know the call will return. Otherwise stay on the evidence ranking and say:

> "Forge LLM can rewrite the wording. It is not allowed to add a cause. If the call fails, or we leave it off because there is no quota, this ranking is the answer."

If you do toggle it, wait for **Forge LLM** on the lozenge, then point out that the cause titles are still the pipeline, the commit, and the pull request.

## 2:05–2:35 — Rovo

Open **Ask Rovo**. Select **Incident Context Copilot**. Use the starter **What are the likely causes of this incident?**

> "Same actions as the panel. Rovo can only talk about causes the tool returned."

When the reply appears, point at one cause that matches the panel.

## 2:35–2:55 — MCP

Cut to Rovo Studio, or to a slide with the tool list if Studio is slow.

> "Those actions are also MCP tools on the Incident Context server. A custom agent, or an external client an admin has enabled, calls the same ranker."

Show the six tools: gather, rank, suggest assignee, checklist, similar incidents, runbooks. All of them are GET. None of them edit Jira.

## 2:55–3:00 — Close

> "Context from the work item, the repo, and the runbook. A cause only if we can point at it. That is how this team ships the next change."

Stop. Do not add a credits card.

## Shot list

| Time | Screen |
| --- | --- |
| 0:00 | Jira bug description with the stack |
| 0:20 | Issue panel: causes, owner, checklist |
| 1:05 | Tabs: code, deploys, runbook, similar |
| 1:40 | Evidence ranking lozenge, LLM toggle untouched or a successful rewrite |
| 2:05 | Rovo chat with Incident Context Copilot |
| 2:35 | Rovo Studio tools, or the six action names |
| 2:55 | Back on the top cause |

## If something fails on camera

- Panel button missing: the work item is not a Bug, Incident, or Problem, or you cannot edit it. Switch issues. Do not debug display conditions on camera.
- Empty code section: click **Load sample incident** and use the line above.
- Rovo does not list the agent yet: stay on the panel. The panel is the product. Mention the agent in one sentence.
- LLM spinner: click **Use evidence ranking only** and continue. Do not wait.
