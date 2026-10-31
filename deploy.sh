#!/bin/bash
# Deploy dist/ to gh-pages from an ISOLATED worktree.
# Never touch the gh-pages branch inside the main checkout: its files live at
# the repo root, so a "clear the root" step there deletes the real source tree.
set -e
REPO="$(cd "$(dirname "$0")" && pwd)"
WT="$(mktemp -d)/alda-pages"
ORIGIN="${PREVIEW_ORIGIN:-https://sindrimar02.github.io/aldamusic-preview}"

PREVIEW_ORIGIN="$ORIGIN" node "$REPO/src/build.mjs"

git -C "$REPO" worktree add --detach -q "$WT"
cd "$WT"
git branch -D gh-pages >/dev/null 2>&1 || true
git checkout -q --orphan gh-pages
git rm -rq --cached . >/dev/null 2>&1 || true
find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -R "$REPO/dist/." .
touch .nojekyll
# GATE 1 — check the STAGED tree, byte-for-byte what gets published. A preview that
# ships without a usable favicon shows the ARTIX helm from the origin root in the
# client's tab. Rules and history: _tools/favicon-guard.mjs
node "$REPO"/../../_tools/favicon-guard.mjs "$WT"

git add -A
git -c user.email=sindri@klubbr.is -c user.name="Sindri Már" commit -q -m "Deploy $(git -C "$REPO" rev-parse --short HEAD) (noindex)"
git push -q -f origin gh-pages
cd "$REPO"
git worktree remove --force "$WT"
echo "gh-pages tree:"; git -C "$REPO" ls-tree --name-only origin/gh-pages

# GATE 2 — on-disk correct is not proof the client sees an icon: the build can rename
# files and the Pages CDN takes a minute. Check the DEPLOYED url. Polls ~3 min.
node "$REPO"/../../_tools/favicon-verify-live.mjs "$ORIGIN/"
