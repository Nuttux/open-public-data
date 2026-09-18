#!/usr/bin/env bash
# Vercel "Ignored Build Step" (vercel.json → ignoreCommand). Runs in website/.
# Exit 0 = skip the build, exit 1 = build.
#
# Why: every build is billed by the CPU minute, and between 17/08 and 18/09/2026
# 77 of 509 builds were for commits that changed nothing under website/
# (pipeline, docs, workflows). The build reads nothing outside this folder, and
# data refreshes commit their files here, so such a commit cannot change the site.
#
# The comparison is against the last commit Vercel deployed on this branch, not
# against HEAD^: a push of three commits whose first one touched the site must
# still build. When that commit is unknown or outside the shallow clone, build.

set -u

# A manual lever: "[skip deploy]" in the commit message. Safe by construction,
# the next build still compares against the last deployed commit.
case "${VERCEL_GIT_COMMIT_MESSAGE:-}" in
  *"[skip deploy]"*)
    echo "ignore-build: [skip deploy] in the commit message, skipping."
    exit 0
    ;;
esac

prev="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -z "$prev" ]; then
  echo "ignore-build: no previous deployment on this branch, building."
  exit 1
fi
if ! git cat-file -e "${prev}^{commit}" 2>/dev/null; then
  echo "ignore-build: ${prev} is not in this clone, building."
  exit 1
fi

if git diff --quiet "$prev" HEAD -- .; then
  echo "ignore-build: nothing under website/ changed since ${prev}, skipping."
  exit 0
fi
echo "ignore-build: website/ changed since ${prev}, building."
exit 1
