#!/usr/bin/env bash
# Repo settings for ofri-peretz/burgee, copied from ofri-peretz/eslint's live state
# on 2026-09-05. Idempotent: safe to re-run; it re-asserts every setting.
#
#   scripts/repo-settings.sh            # apply
#   scripts/repo-settings.sh --check    # print current state, change nothing
set -euo pipefail
REPO="${REPO:-ofri-peretz/burgee}"

if [ "${1:-}" = "--check" ]; then
  gh api "repos/$REPO" --jq '{allow_squash_merge,allow_merge_commit,allow_rebase_merge,allow_auto_merge,delete_branch_on_merge,allow_update_branch,squash_merge_commit_title,squash_merge_commit_message,has_issues,has_wiki,has_projects,security_and_analysis}'
  gh api "repos/$REPO/branches/main/protection" --jq '{required_status_checks: .required_status_checks.contexts, enforce_admins: .enforce_admins.enabled, linear: .required_linear_history.enabled, conversation: .required_conversation_resolution.enabled, force_push: .allow_force_pushes.enabled}' || echo "main: not protected"
  exit 0
fi

echo "▸ repository settings"
gh api -X PATCH "repos/$REPO" \
  -f description="Interlace CLI — agent-native extensions for commander and yargs: one schema, a JSON envelope on every command, an exit-code contract, and a manifest an AI agent reads in one call." \
  -f homepage="https://github.com/$REPO/blob/main/docs/intents/agent-native-cli-layer/design.md" \
  -F has_issues=true -F has_wiki=false -F has_projects=false \
  -F allow_squash_merge=true -F allow_merge_commit=true -F allow_rebase_merge=true \
  -F allow_auto_merge=true -F delete_branch_on_merge=true -F allow_update_branch=true \
  -f squash_merge_commit_title=COMMIT_OR_PR_TITLE -f squash_merge_commit_message=COMMIT_MESSAGES \
  --silent

echo "▸ secret scanning + push protection"
gh api -X PATCH "repos/$REPO" --input - --silent <<'JSON'
{"security_and_analysis":{"secret_scanning":{"status":"enabled"},"secret_scanning_push_protection":{"status":"enabled"}}}
JSON

echo "▸ topics"
gh repo edit "$REPO" --add-topic cli --add-topic commander --add-topic yargs --add-topic ai-agents \
  --add-topic interlace --add-topic turborepo --add-topic eslint-plugin >/dev/null

echo "▸ branch protection on main (same shape as eslint)"
gh api -X PUT "repos/$REPO/branches/main/protection" --input - --silent <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["Quality Gate", "Quality (Full) Gate", "review"] },
  "enforce_admins": true,
  "required_pull_request_reviews": { "dismiss_stale_reviews": false, "require_code_owner_reviews": false, "required_approving_review_count": 0 },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true,
  "lock_branch": false
}
JSON

echo "▸ labels"
python3 - "$REPO" <<'PY'
import re, subprocess, sys
repo = sys.argv[1]
text = open('.github/labels.yml').read()
for name, color, desc in re.findall(r'- name: (\S+)\n  color: "(\w+)"\n  description: "([^"]*)"', text):
    subprocess.run(['gh', 'label', 'create', name, '-R', repo, '--color', color, '--description', desc, '--force'], check=True, capture_output=True)
    print(f'  {name}')
PY

echo "✓ done — verify with: scripts/repo-settings.sh --check"
