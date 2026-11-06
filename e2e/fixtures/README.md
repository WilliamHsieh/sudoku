# Deployed updater fixture

`legacy-78bf225.tar.gz` contains unmodified production source from
`origin/master` commit `78bf22570e5bed0cd0a9f9b66ff55bb9419763a8`.
It includes the actual schema-1 updater and its 1500 ms verification deadline.
The upgrade suite builds it locally using this checkout's installed tools.
No network fetch, source rewrite, or other worktree is required.

Reproduce the archive from a repository containing that commit:

```sh
git archive --format=tar.gz --output=e2e/fixtures/legacy-78bf225.tar.gz \
  78bf22570e5bed0cd0a9f9b66ff55bb9419763a8 \
  src public build favicon index.html vite.config.js package.json package-lock.json
```

Only build identity environment variables differ. The suite serves this build
as `legacy`, then publishes the current production build to the same origin.
