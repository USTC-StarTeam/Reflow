# Reflow Agent Development Guide

This file defines the default development behavior for AI coding agents working on Reflow.

Keep this document short and stable.

Task-specific product requirements belong in the task prompt or relevant product docs, not in this file.

---

## 1. Development Philosophy

### Prefer the smallest sufficient change

Solve the concrete problem requested.

Do not turn a small bug fix, UI adjustment, or local behavior change into an architectural project.

Do not proactively introduce:

- new abstractions;
- generalized frameworks;
- state machines;
- fallback layers;
- compatibility layers;
- defensive infrastructure;
- future-facing APIs;
- large validation systems;
- large edge-case test matrices;

unless the current task actually requires them.

If a simple task starts producing a large diff, stop and reconsider the approach.

In Reflow:

> Simple and correct beats generalized and theoretically complete.

---

## 2. Scope Discipline

The requested task scope is authoritative.

Do not:

- redesign adjacent features;
- refactor unrelated code;
- clean up nearby code without need;
- solve hypothetical future problems;
- expand product behavior beyond the requested direction;
- add features just because they seem useful.

If you discover an unrelated problem:

1. mention it;
2. record it if useful;
3. do not fix it unless it blocks the current task.

One task should normally solve one clear problem.

---

## 3. Follow the Existing Product Direction

Reflow is a:

> local-first, mobile-first personal execution and planning product.

When the user provides:

- a reference image;
- a page structure;
- an interaction description;
- an existing product skeleton;

follow that direction.

Do not replace it with a newly invented information architecture.

The coding agent is responsible for implementation details, not for redefining the product.

Default UI principle:

> Complexity on demand.

Prefer:

- simple first-level interfaces;
- compact information hierarchy;
- progressive disclosure;
- lightweight primary interactions;
- advanced actions behind secondary interactions.

Avoid turning pages into dashboards unless explicitly requested.

---

## 4. Architecture Invariants

Reflow uses an explicit and testable pipeline:

    Capture
    → ProposalService
    → AIProposal
    → UserDecision
    → Task / Knowledge
    → Planning / Execution
    → Review

Preserve these boundaries unless the task explicitly changes them.

Important invariants:

- AI produces proposals.
- AI must not silently change formal domain state.
- Formal task changes go through existing Store / Reducer domain actions.
- UI code must not bypass the domain write path.
- `TaskItem.plannedDate` is the source of truth for current date ownership.
- Planning history follows existing `TaskPlanEvent` semantics.
- Deterministic Review facts remain deterministic.
- Do not silently change persistence formats.
- Do not casually change core domain types.

For ordinary UI work, adapt the presentation to the existing domain model rather than redesigning the domain.

---

## 5. Reuse Existing Behavior

Before adding a new mechanism, inspect whether the repository already provides one.

Prefer reusing existing:

- Store methods;
- Domain Actions;
- selectors;
- shared UI components;
- scheduling behavior;
- modal patterns;
- validation helpers;
- existing workflows.

Do not create a second implementation of an existing workflow simply because it is locally convenient.

Small local components are fine when they keep the implementation simple.

Do not create a generalized abstraction unless there is a real current need for one.

---

## 6. Testing Should Match the Change

Testing effort should be proportional to the task.

### Small bug fix

Usually:

- modify the smallest relevant code;
- add or update one directly relevant test when useful;
- run the relevant existing tests.

Do not build a large edge-case matrix for a narrow bug.

### Normal feature

Test:

- the main user path;
- important existing invariants directly touched by the feature.

### Core or persistence change

More extensive tests are appropriate when modifying:

- persistence;
- migrations;
- core domain types;
- destructive operations;
- UserDecision semantics;
- TaskPlanEvent semantics;
- AI / Gateway trust boundaries.

Do not weaken existing tests merely to make a change pass.

During development, prefer targeted checks.

Before a PR is ready, use the repository's normal verification process.

Common commands:

~~~bash
npm run typecheck
npm run lint
npm test
npm run test:gateway
npm run test:e2e
npm run export:web
~~~

Do not repeatedly run every expensive check after every tiny edit.

---

## 7. Core Changes Require Extra Care

Most product iteration should stay in the feature or presentation layer.

Changes involving the following deserve additional care:

- core domain types;
- persistence schema;
- migrations;
- backup format;
- destructive data behavior;
- UserDecision semantics;
- TaskPlanEvent semantics;
- AI / Gateway trust boundaries.

Do not modify these simply because doing so would make a UI implementation easier.

If a task genuinely requires a core change:

- keep it explicit;
- keep it narrow;
- avoid unrelated refactoring.

---

## 8. UI Implementation

When implementing UI from an existing reference:

1. understand the intended product structure;
2. preserve the information hierarchy;
3. reuse existing behavior;
4. implement the smallest solution that reaches the target;
5. avoid introducing unrelated product behavior.

Visual similarity alone is not enough if interaction semantics are wrong.

Likewise, do not create fake domain behavior merely to make a visual control appear functional.

If a future capability is visible in the design but does not yet have a trustworthy implementation, it is acceptable to leave it clearly unavailable.

---

## 9. Product Surface vs Domain Capability

Reflow uses progressive disclosure.

The domain may support more information and actions than the first-level UI shows.

That is intentional.

Do not expose every available field just because it exists.

For example, first-level pages do not automatically need to show:

- category;
- next action;
- actual time;
- execution logs;
- source metadata;
- internal AI reasoning;
- planning history.

Keep advanced information in Detail or secondary interactions when appropriate.

---

## 10. Expo and Cross-Platform Work

Reflow currently uses Expo SDK 57.

For version-sensitive Expo or React Native behavior, consult the exact versioned documentation:

https://docs.expo.dev/versions/v57.0.0/

Do not assume behavior from another Expo SDK version.

The project shares code between Web and native platforms.

Avoid introducing Web-only assumptions into shared files unless platform-specific implementations already isolate them, such as:

    *.web.tsx

Web is currently an important development and CI target, but changes should not unnecessarily prevent future Android / iOS use.

---

## 11. Git and PR Rules

Follow `CONTRIBUTING.md`.

Important rules include:

- never push directly to `main`;
- work on a feature or fix branch;
- changes go through PRs;
- CI must be green before merge.

Keep PRs focused.

Do not combine unrelated cleanup with the requested task.

When working under a supervising agent or user review workflow:

> Do not merge the PR unless explicitly asked to merge it.

Creating or updating the PR is not permission to merge it.

---

## 12. Avoid Over-Engineering

Before adding complexity, ask:

> Is this required to solve the current task?

If the answer is no, do not add it.

In particular, do not automatically add:

- additional guards for hypothetical cases;
- generic state synchronization frameworks;
- new error-handling layers;
- generalized utility systems;
- speculative compatibility code;
- future migration infrastructure;
- large amounts of defensive validation.

Existing architecture and CI already provide broad protection.

A small bug should usually produce a small patch.

If a small task unexpectedly requires major architecture changes, stop and report the reason before continuing.

---

## 13. Handling Newly Discovered Issues

While implementing a task, you may notice another issue.

Classify it as follows.

### Blocks the current task

Fix it with the smallest necessary change.

### Does not block the current task

Do not fix it.

Mention it separately for possible future work.

Do not recursively inspect and fix every nearby issue.

The goal is to complete the requested task, not continuously audit the repository.

---

## 14. Default Task Workflow

For most tasks:

1. Read the request.
2. Inspect the relevant code.
3. Inspect nearby existing patterns.
4. Identify the smallest sufficient solution.
5. Implement it.
6. Add or update only directly useful tests.
7. Run relevant checks.
8. Review the diff for accidental scope growth.
9. Stop when the requested problem is solved.

Do not continue improving unrelated parts of the repository afterward.

---

## 15. Decision Rule

When multiple implementations are valid, prefer the one that:

1. changes less code;
2. reuses more existing behavior;
3. introduces fewer new concepts;
4. is easier to understand;
5. is easier to revise later;
6. directly matches the requested product behavior.

Do not optimize prematurely for hypothetical future requirements.

---

## 16. Repository References

Use these files for additional context when necessary:

- `README.md` — current product and architecture overview;
- `CONTRIBUTING.md` — Git and collaboration rules;
- `gateway/README.md` — AI Gateway behavior and configuration;
- relevant files under `docs/` — feature-specific or historical design information.

Do not read every document before every task.

Read only what is relevant to the current work.

---

## Final Principle

Reflow is currently under active product iteration.

The priority is:

> make the intended product work clearly, incrementally, and with minimal unnecessary complexity.

Do not try to make every small change architecturally perfect.

Build the simplest correct version that fits the existing product and architecture.