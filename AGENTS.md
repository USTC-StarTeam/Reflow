# Reflow Agent Development Guide

This file defines the default behavior for AI coding agents working on Reflow.

Keep it short and stable.

Task-specific product requirements belong in the task prompt or relevant product docs.

---

## 1. Core Principle

Prefer the smallest sufficient change.

Solve the concrete problem requested.

Do not turn a small bug fix, UI adjustment, or local interaction change into an architectural project.

In Reflow:

> Simple and correct beats generalized and theoretically complete.

A small task should usually produce a small diff.

If a simple task unexpectedly requires a large change, stop and explain why before continuing.

---

## 2. Scope Discipline

The requested task scope is authoritative.

Do not:

- redesign adjacent features;
- refactor unrelated code;
- clean up nearby code without need;
- solve hypothetical future problems;
- add abstractions for possible future use;
- expand product behavior beyond the request.

If you discover an unrelated issue:

- fix it only if it blocks the current task;
- otherwise mention it and leave it for later.

Do not recursively audit or repair the repository while completing another task.

Stop when the requested problem is solved.

---

## 3. Follow the Existing Product Direction

Reflow is a local-first, mobile-first personal execution and planning product.

When the user provides a reference image, interaction description, page structure, or existing product skeleton, follow it.

Do not replace it with a newly invented information architecture.

The coding agent owns implementation details, not product redefinition.

Default UI principle:

> Complexity on demand.

Prefer:

- simple first-level interfaces;
- compact information hierarchy;
- progressive disclosure;
- lightweight primary interactions;
- advanced actions in secondary interactions.

Do not turn pages into dashboards unless explicitly requested.

---

## 4. Preserve Architecture Boundaries

Reflow follows this explicit pipeline:

    Capture
    → ProposalService
    → AIProposal
    → UserDecision
    → Task / Knowledge
    → Planning / Execution
    → Review

Preserve existing boundaries unless the task explicitly changes them.

Important invariants:

- AI produces proposals only.
- AI must not silently change formal domain state.
- Formal task changes go through existing Store / Reducer actions.
- UI code must not bypass the domain write path.
- `TaskItem.plannedDate` is the source of truth for current date ownership.
- Planning history follows existing `TaskPlanEvent` semantics.
- Deterministic Review facts remain deterministic.
- Do not casually change persistence formats or core domain types.

For ordinary UI work, adapt the presentation to the existing domain model rather than redesigning the domain.

---

## 5. Reuse Existing Behavior

Before creating a new mechanism, check whether the repository already provides one.

Prefer reusing existing:

- Store methods;
- Domain Actions;
- selectors;
- shared UI components;
- scheduling behavior;
- modal patterns;
- validation helpers;
- existing workflows.

Do not create a second implementation of an existing workflow just because it is locally convenient.

Small local components are fine.

Do not create generalized abstractions without a real current need.

---

## 6. Verification Discipline

Verification effort must match the risk of the change.

For small UI changes, narrow bug fixes, and local interaction changes:

1. make the smallest relevant change;
2. run only the directly relevant test or lightweight check;
3. review the final diff;
4. push;
5. let GitHub CI perform the full repository verification.

Do not run the full local test suite by default.

In particular:

- do not run Gateway tests unless Gateway behavior changed;
- do not run E2E unless the changed user flow requires it;
- do not run web export unless build/export behavior changed;
- do not repeatedly run typecheck, lint, or tests after tiny edits.

If a relevant check passed and the related code has not changed afterward, do not run it again.

Do not run baseline checks before editing unless there is a concrete reason to suspect the existing code is already broken.

A full local verification pass is appropriate only for higher-risk changes such as:

- core Domain or Reducer semantics;
- persistence or migrations;
- backup format;
- destructive operations;
- UserDecision semantics;
- TaskPlanEvent semantics;
- AI / Gateway trust boundaries;
- broad cross-module changes.

GitHub CI is the default final full gate for ordinary changes.

> A passing relevant check is enough to stop.

Do not seek additional confidence without a concrete reason.

---

## 7. Avoid Over-Engineering

Do not automatically introduce:

- generalized frameworks;
- new state machines;
- compatibility layers;
- fallback systems;
- defensive infrastructure;
- speculative APIs;
- migration systems for future needs;
- large validation layers;
- large edge-case test matrices.

Before adding complexity, ask:

> Is this required to solve the current task?

If not, do not add it.

Do not modify core architecture merely because doing so would make one UI implementation easier.

---

## 8. Product Surface Rules

The domain may support more information and actions than the first-level UI shows.

That is intentional.

Do not expose fields simply because they exist.

First-level pages do not automatically need to show:

- category;
- next action;
- actual time;
- execution logs;
- source metadata;
- internal AI reasoning;
- planning history.

Keep advanced information in Detail or secondary interactions when appropriate.

Visual similarity is not enough if interaction semantics are wrong.

Likewise, do not create fake domain behavior only to make a visual control appear functional.

---

## 9. Git and PR Workflow

Follow `CONTRIBUTING.md`.

Important defaults:

- never push directly to `main`;
- work on a feature or fix branch;
- changes go through PRs;
- CI must be green before merge;
- keep PRs focused.

Do not combine unrelated cleanup with the requested task.

When working under a supervising agent or user review workflow:

> Do not merge a PR unless explicitly asked to merge it.

Creating or updating a PR is not permission to merge it.

---

## 10. Expo and Cross-Platform Work

Reflow currently uses Expo SDK 57.

For version-sensitive Expo or React Native behavior, consult:

https://docs.expo.dev/versions/v57.0.0/

Do not assume behavior from another Expo SDK version.

Reflow shares code between Web and native platforms.

Avoid unnecessary Web-only assumptions in shared files.

Use platform-specific files such as `*.web.tsx` when the existing architecture calls for them.

---

## Default Task Workflow

For most tasks:

1. Read the request.
2. Inspect only the relevant code and nearby existing patterns.
3. Identify the smallest sufficient solution.
4. Implement it.
5. Add or update only directly useful tests.
6. Run the smallest relevant verification.
7. Review the diff for accidental scope growth.
8. Stop.

Do not continue improving unrelated parts of the repository afterward.

---

## Decision Rule

When several implementations are valid, prefer the one that:

1. changes less code;
2. reuses more existing behavior;
3. introduces fewer new concepts;
4. is easier to understand;
5. is easier to revise later;
6. directly matches the requested behavior.

Do not optimize prematurely for hypothetical future requirements.

---

## Repository References

Read additional documentation only when relevant:

- `README.md` — current product and architecture;
- `CONTRIBUTING.md` — Git and collaboration rules;
- `gateway/README.md` — AI Gateway behavior;
- relevant files under `docs/` — feature-specific context.

Do not read every document before every task.

---

## Final Principle

Reflow is under active product iteration.

The priority is:

> Build the simplest correct version that matches the intended product and existing architecture.

Do not make every small change architecturally perfect.

Do not maximize verification evidence.

Solve the requested problem, verify the affected path, and stop.
