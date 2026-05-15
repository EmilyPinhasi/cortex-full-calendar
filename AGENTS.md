# Cortex Full Calendar

Personal fork of [Full Calendar (Remastered)](https://github.com/YouFoundJK/obsidian-full-calendar). Solo project; `main` is the only branch; no PR review.

## Workflow

After completing a code change: build, commit, and push to `origin/main` without asking. Don't skip pre-commit hooks (`--no-verify`) — fix the underlying lint/type errors.

```
npm run build   # esbuild + tsc + eslint (the commit hook runs these too)
```

Still confirm before destructive ops (force push, `reset --hard`, rewriting published history).

## Fork-specific notes

This fork coexists with the upstream plugin in the same vault. The plugin id and view types were renamed to avoid collisions (see commit `ea0f0f2`). If touching plugin IDs, view registrations, or settings file locations, check that nothing collides with `obsidian-full-calendar`.

Pending fork cleanup items live in `TODO.md`.
