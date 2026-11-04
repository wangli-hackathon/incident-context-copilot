# Incident Context Copilot

**Codegeist 2026** · Devpost · Theme: Build with context, ship with confidence · Category: Software Teams

Also entered for the Rovo Agent and Atlassian MCP bonus prizes.

## Inspiration

The slow part of an incident is not the fix. It is the first ten minutes. The bug text says `TimeoutError` in `src/checkout/charge.js`. The deploy that shipped it is on another panel. The runbook is a Confluence search away. The person who fixed this last quarter is buried in a resolved ticket. Each of those facts is already in Atlassian, and the person on call still has to assemble them by hand before they trust a next step.

We wanted a teammate that shows up on the work item with the evidence attached, and that will not invent a cause when the evidence is missing.

## What it does

Incident Context Copilot is a Forge app. On a Jira bug or incident it gathers:

- the work item, comments, and links
- Bitbucket commits, pull requests, and recent pipelines for the service repository
- Confluence runbook pages
- similar Jira bugs and incidents, including who resolved them

It then shows three things in a Jira issue panel:

- likely causes, ranked, with the signal that earned each score
- a suggested owner, from code authorship and from who resolved similar issues
- a checklist, starting with customer impact, a failed production pipeline, and assignment

The same six read-only actions are on a Rovo agent, a Rovo skill, and a Rovo MCP server. A custom agent in Rovo Studio can call them, and an admin can expose them to an external MCP client at `https://mcp.atlassian.com/forge/<app-id>`.

The ranking is deterministic and tested. Forge LLM can rewrite the sentences. If the model names a cause that was not fetched, or the call fails, or you leave the toggle off because there is no quota, the evidence ranking remains. The app never assigns, transitions, or comments.

**Load sample incident** plays a frozen story, PAY-204: a failed production pipeline, the hotfix commit that touched `charge.js`, an open pull request, a runbook, and a resolved twin. Judges can record that path on an empty site.

## How we built it

- Forge UI Kit issue panel, one resolver, one action handler shared by every Rovo action.
- `rovo:agent`, `rovo:skill`, and `rovo:mcp` all point at the same `GET` actions.
- Jira REST for the work item, changelog, and `POST /rest/api/3/search/jql`.
- Confluence CQL search for runbooks.
- Bitbucket REST for commits, diffs, pull requests, and pipelines. The repository is saved per project in Forge KVS, or taken from a Bitbucket URL already on the work item.
- `@forge/llm` with `claude-sonnet-4-6`, declared with the `llm` module so the call stays on Atlassian infrastructure.
- Pure functions for signals, weights, clustering, assignee share, checklist rules, and the LLM merge. `npm test` covers them without a site.

## Challenges we ran into

Jira's development panel is not a public API for Forge. `/rest/dev-status` has no scope, so a Forge app cannot read the commits and builds the issue view already shows. We read Bitbucket directly and we say so in the panel. Deployments are pipeline runs and deployment-shaped remote links, not a silent scrape of the development panel.

Forge LLM has had no free quota since 1 June 2026. A hackathon demo that depends on a model call will fail on stage. The ranker is the product. The model is a rewrite with a schema that drops unknown cause ids.

Bitbucket's Forge route wants a workspace id, while links on a work item contain a slug. The panel accepts either, and a 404 tells the user to paste the UUID.

Rovo actions and MCP tools run as the user, and MCP blocks `asApp()`. The action path does not fall back to the app user. The panel can, only when the module cannot use `asUser()` at all.

Issue panels are easy to hide by accident. The button is limited to Bug, Incident, Problem, and [System] Incident, and Jira only shows it to people who can edit the work item. The README says both, because a judge on a Task will otherwise think the app did not install.

## Accomplishments that we're proud of

The panel, the agent, and the MCP tools cannot disagree about the ranking, because they call one function. A failed production pipeline that names the issue key outranks a recent hotfix commit, which outranks an open pull request, which outranks a similar resolved incident. An old CSS commit and a successful release that never mentions the key do not become causes. That order is a unit test, not a prompt.

The model is not trusted with new facts. Tests feed it an invented cause id and a person who is not in the candidate list, and both are discarded. A quota error still returns the checklist.

The app is read-only. Installing it does not grant write access to Jira.

## What we learned

Context is only useful if a person can see where it came from. A confidence number without the signal ("names PAY-204", "touches charge.js", "pipeline failed") is a vibe. Shipping with confidence meant deleting answers we could not attach to a fetched object.

It also meant treating "the platform does not expose this" as a product constraint. We documented the development-panel gap instead of calling a private API that would 401.

## What's next

- A confirmed comment draft, still not posted until the user asks, once we are willing to take `write:jira-work`.
- A supported read API for Jira deployments and the development panel, if Atlassian ships one for Forge.
- Remember which ranked cause the team accepted, and weight the next incident toward that pattern.
- A short customer-facing status note that can only use sentences already in the brief.

## Built with

Atlassian Forge, Forge UI Kit, Jira Cloud REST API, Confluence CQL, Bitbucket Cloud REST API, Rovo, Rovo MCP, Forge LLM, Node.js.
