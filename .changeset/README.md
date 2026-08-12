# Changesets

Each package in this monorepo is versioned independently. When a change touches a package under `packages/*` or `apps/*`, run:

```bash
pnpm changeset
```

and follow the prompts to record which package(s) changed and at what bump (patch/minor/major). Commit the generated `.changeset/*.md` file alongside your change.
