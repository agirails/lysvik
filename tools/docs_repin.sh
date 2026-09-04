#!/usr/bin/env zsh
# Post-deploy docs re-pin (the S148 ritual, folded into tools/ at sync-v11.6 as owed).
# Usage: tools/docs_repin.sh <DEPLOYED_SHA40> <gv-worktree-AT-that-sha> <sync-tag e.g. v11.7> <docs-branch>
# Regenerates the world-api contract IN the gv worktree at the deployed SHA (the committed copy stamps its parent —
# a bare copy fails D3 by exactly one parent), copies it, restores the worktree, bumps VERSION.json + every doc pin,
# runs docs_check bare then --live, reads each exit bare. Writes NO changelog (write it by hand: what shipped AND
# what did not) and does NOT commit or push. Every exit is read on its own line; nothing is piped after a gate.
set -u; DEP="$1"; GV="$2"; TAG="$3"; BR="$4"; SHORT=${DEP:0:7}; cd "$(dirname "$0")/.." || exit 2
git checkout -q "$BR" || exit 3
[ "$(git -C "$GV" rev-parse HEAD)" = "$DEP" ] || { echo "gv worktree is not at $DEP — REFUSING"; exit 4; }
[ -z "$(git -C "$GV" status --short)" ] || { echo "gv worktree is dirty — REFUSING"; exit 5; }
( cd "$GV" && node --import tsx scripts/gen-world-api-contract.mjs >/dev/null 2>&1 ) || { echo "regen at $SHORT failed — REFUSING"; exit 6; }
STAMP=$(python3 -c "import json;print(json.load(open('$GV/contracts/world-api.contract.json'))['generated_from'])")
[ "$STAMP" = "genesis-village@$SHORT" ] || { echo "regen stamped $STAMP, expected genesis-village@$SHORT — REFUSING"; exit 7; }
cp "$GV/contracts/world-api.contract.json" contracts/world-api.contract.json
( cd "$GV" && git checkout -- contracts/world-api.contract.json )
python3 - "$SHORT" "$TAG" <<'PY'
import json,sys,glob,datetime
new,tag=sys.argv[1],sys.argv[2]
v=json.load(open('VERSION.json')); old=v['verified_against']['genesis-village']
v['verified_against']['genesis-village']=new; v['upstream']['genesis-village']=new
v['verified_against']['arc']=f"V{tag[1:]} (sync-{new} · {datetime.date.today().isoformat()})"; v['docs_sync']=f'sync-{tag}'
json.dump(v,open('VERSION.json','w'),indent=2,ensure_ascii=False); open('VERSION.json','a').write('\n')
n=0
for f in glob.glob('docs/*.md')+['README.md']:
    s=open(f).read(); t=s.replace(f'genesis-village@{old}', f'genesis-village@{new}')
    if t!=s: open(f,'w').write(t); n+=1
print(f'pin {old} -> {new} · docs re-pinned: {n}')
PY
python3 tools/docs_check.py > /tmp/docs-check.log 2>&1; echo "docs_check EXIT:$?"
python3 tools/docs_check.py --live > /tmp/docs-check-live.log 2>&1; echo "docs_check --live EXIT:$?"
echo "Now: write the CHANGELOG sync-$TAG entry, assert len(actions) against live GET /worlds/lysvik/actions, commit with -F, push the branch, get the second seat's read, then main."
