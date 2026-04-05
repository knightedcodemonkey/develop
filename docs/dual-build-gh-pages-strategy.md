# Dual Build GitHub Pages Strategy

## Purpose

Document a clean migration strategy for delivering both stable and overhaul UI versions from one repository without adding runtime feature flags to application code.

## Core Idea

Build two versions of the site during deployment and publish both under one GitHub Pages branch.

- Stable site at root path: /index.html
- Overhaul site at next path: /next/index.html

The URL path acts as the switch.

- Stable: /develop/
- Overhaul: /develop/next/

## Why This Approach

1. Keeps runtime code clean.
2. Avoids pervasive if version checks in app modules.
3. Allows side-by-side validation of stable and next UX.
4. Reduces long-term cleanup work versus in-app toggles.

## Deployment Layout

Publish a combined artifact to the GitHub Pages branch with this shape:

- /index.html and root assets from stable branch build
- /next/index.html and next assets from overhaul branch build

## CI Workflow Design

A deployment workflow builds both branches in one run and publishes one artifact.

1. Checkout stable branch into an isolated worktree directory.
2. Install dependencies and build stable output.
3. Copy stable output into publish root.
4. Checkout overhaul branch into a second isolated worktree directory.
5. Install dependencies and build overhaul output.
6. Copy overhaul output into publish root under /next.
7. Deploy combined publish folder to GitHub Pages.

## Operational Guidance

1. Run both builds in isolated directories to prevent cross-branch contamination.
2. Keep Node and npm versions pinned consistently in CI.
3. Use workflow concurrency to cancel outdated deploy jobs.
4. Use relative asset URLs so content works under both root and /next paths.
5. Fail the deploy if either build fails.

## Source Control Model

- main branch represents stable production UX.
- overhaul branch represents next-generation UX.
- Deploy workflow may trigger on pushes to either branch, but each run should still build both branches for a consistent dual-output artifact.

## Relationship To App Architecture Work

This strategy complements the multi-tab and local workspace migration by separating rollout concerns from runtime logic.

- Runtime implementation remains modular and focused on architecture.
- Deployment controls the exposure of stable versus next.

## Tradeoffs

Pros:

1. Cleaner codebase during migration.
2. Lower risk of runtime toggle regressions.
3. Clear QA and stakeholder review URLs.

Cons:

1. Longer deploy times due to dual builds.
2. More CI configuration complexity.
3. Temporary branch coordination requirements.

## Exit Plan

After next UI is production-ready:

1. Promote next code into main.
2. Remove dual-build deployment logic.
3. Publish only root output again.
4. Remove migration-only docs and branch conventions.

## Suggested Follow-up

1. Add a deploy workflow implementation doc with exact GitHub Actions YAML and permissions.
2. Add a release checklist for validating both URLs before each deploy.
3. Add ownership notes for stable and next branch review responsibilities.
