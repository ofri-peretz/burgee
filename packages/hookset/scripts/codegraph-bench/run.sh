#!/bin/bash
# One headless Claude Code session on one task, in one arm. usage: run.sh ARM TASK REP
#   ARM A: no MCP server.  ARM B: the codegraph server hookset pins (stations.json).
# WORK/A and WORK/B are clean checkouts of the repo; WORK/B has `codegraph init` run in it.
set -eu
HERE=$(cd "$(dirname "$0")" && pwd); WORK=${WORK:?set WORK to the folder holding the A and B checkouts}
ARM=$1; TASK=$(sed -n "${2}p" "$HERE/tasks.txt"); mkdir -p "$WORK/out"
if [ "$ARM" = B ]; then
  node -e 'const s=require(process.argv[1]).claude.mcp[0];console.log(JSON.stringify({mcpServers:{[s.id]:s.server}}))' "$HERE/../../stations.json" > "$WORK/mcp-B.json"
else echo '{"mcpServers":{}}' > "$WORK/mcp-A.json"; fi
cd "$WORK/$ARM" && timeout 900 claude -p "$TASK" --model "${MODEL:-claude-sonnet-5-5}" --output-format stream-json --verbose \
  --strict-mcp-config --mcp-config "$WORK/mcp-$ARM.json" \
  --allowedTools "Read,Grep,Glob,LS,Bash(grep:*),Bash(rg:*),Bash(git grep:*),Bash(find:*),Bash(ls:*),Bash(cat:*),Bash(sed:*),Bash(head:*),mcp__codegraph__codegraph_explore" \
  > "$WORK/out/out-$ARM-$2-$3.jsonl" 2> "$WORK/out/err-$ARM-$2-$3.txt"
