# Evidence rules

The ranker is deterministic. Forge LLM may reorder causes and rewrite sentences. It cannot add a cause id that the ranker did not return.

A candidate needs confidence of at least 25. The score is the sum of the signals below, capped at 100.

| Signal | Weight | Meaning |
| --- | --- | --- |
| Names the issue key | 22 | Commit, pull request, or pipeline text contains the key |
| Touches a file from the report | 26 | A fetched diff touches a path named in the work item |
| Names an exception from the report | 12 | The change text includes the same `*Error` or `*Exception` |
| Landed in the last 48 hours | 14 | Newer than two days |
| Landed in the last 7 days | 8 | Used when the change is older than 48 hours |
| Landed in the last 30 days | 4 | Weak recency |
| Open pull request | 12 | The matching pull request is open |
| Merged pull request | 8 | The matching pull request has merged |
| Failed or stopped deploy | 30 | Pipeline result failed, errored, or stopped |
| Production environment | 12 | Branch is main, master, production, prod, or release |
| Hotfix or rollback | 10 | Text says revert, hotfix, rollback, or rolled back |
| Similar resolved issue | 16 | Plus up to 50 times the term overlap with this report |
| Shared component | 10 | Same Jira component |
| Shared label | 6 | Same label |
| Linked issue | 12 | The work item links the past issue |
| Stack signature only | 28 | An exception and a file are named, and no fetched change touches that file |

The suggested assignee is the person with the largest sum of confidence across the ranked causes they authored or resolved. The panel does not assign the work item.

The checklist always asks for customer impact. A failed production pipeline, an empty assignee, and the top clue are `now`. Commits, pull requests, runbooks, and similar issues are `next`.
