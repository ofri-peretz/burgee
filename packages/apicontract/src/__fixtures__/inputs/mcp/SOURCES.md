# MCP fixtures

30 documents, each unchanged except that the github-mcp-server files are renamed from `<tool>.snap`
to `github-<tool>.json`. Read 2026-11-18.

## The MCP specification's examples

From [`modelcontextprotocol/modelcontextprotocol`](https://github.com/modelcontextprotocol/modelcontextprotocol)
at commit `d4b317231161ee96d3eefb2448bda4230c76f4c6`, under `schema/2026-07-28/examples/`. Licence:
Apache-2.0 for specification contributions, MIT for those not yet relicensed (the repository's
`LICENSE` describes the transition); both permit this copy.

| File | Source |
| :-- | :-- |
| `tools-list-with-cursor-and-ttl.json` | `ListToolsResult/tools-list-with-cursor-and-ttl.json` |
| `prompts-list-with-cursor-and-ttl.json` | `ListPromptsResult/prompts-list-with-cursor-and-ttl.json` |
| `resource-templates-list-with-cursor-and-ttl.json` | `ListResourceTemplatesResult/resource-templates-list-with-cursor-and-ttl.json` |
| `tool-with-array-output-schema.json` | `Tool/tool-with-array-output-schema.json` |
| `tool-with-composition-input-schema.json` | `Tool/tool-with-composition-input-schema.json` |
| `with-default-2020-12-input-schema.json` | `Tool/with-default-2020-12-input-schema.json` |
| `with-explicit-draft-07-input-schema.json` | `Tool/with-explicit-draft-07-input-schema.json` |
| `with-no-parameters.json` | `Tool/with-no-parameters.json` |
| `with-output-schema-for-structured-content.json` | `Tool/with-output-schema-for-structured-content.json` |

URL pattern: `https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/<commit>/schema/2026-07-28/examples/<source>`.

## github-mcp-server tool snapshots

From [`github/github-mcp-server`](https://github.com/github/github-mcp-server) (MIT) at commit
`4e6e6c053e48aac182f7768162fef2ad42fe7d5f`, `pkg/github/__toolsnaps__/<tool>.snap`: the tool
definitions the server's own tests lock, the 21 smallest of 156. Two (`list_tags_output`,
`list_branches_output`) carry `"inputSchema": null`, which the reader reports.

`github-create_gist.json`, `github-create_pull_request.json`, `github-dismiss_notification.json`,
`github-get_discussion.json`, `github-get_job_logs.json`, `github-get_label.json`,
`github-get_team_members.json`, `github-get_teams.json`, `github-label_write.json`,
`github-list_available_automation_tools.json`, `github-list_branches.json`,
`github-list_branches_output.json`, `github-list_discussion_categories.json`,
`github-list_issue_types.json`, `github-list_tags.json`, `github-list_tags_output.json`,
`github-search_code.json`, `github-star_repository.json`, `github-update_gist.json`,
`github-update_issue_comment.json`, `github-update_pull_request_branch.json`.

URL pattern: `https://raw.githubusercontent.com/github/github-mcp-server/<commit>/pkg/github/__toolsnaps__/<tool>.snap`.

## Not here yet

The intent asks for the `tools/list` snapshots of the ten SC10 servers
([`D-20261106-apicontract-mcp-corpus`](../../../../../../.sdlc/decisions/D-20261106-apicontract-mcp-corpus.md)).
None publishes one; taking them means running each server, which is the corpus lane's snapshot step.
