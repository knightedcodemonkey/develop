# AI Chat Context and Payload Strategy

This document describes the current AI chat request construction approach in @knighted/develop, including context shaping, tool usage, payload-size controls, and known improvement opportunities.

## Current Approach

### 1. System prompt and mode-aware policy

Each request includes a system prompt with policy guidance, then augments that prompt with mode-aware constraints:

- Render mode guidance (DOM vs React)
- Style mode guidance (css, module, less, sass)
- DOM-mode JSX guidance for @knighted/jsx runtime
- Explicit React-avoidance in DOM mode unless migration is requested
- Dialect preservation guidance (avoid cross-dialect rewrites unless requested)

Primary implementation:

- src/modules/github/chat/payload.js

### 2. Repository context

Each request includes repository targeting context as a dedicated system message:

- Selected repository full name
- Repository URL
- Default branch
- Policy to treat selected repository as default unless overridden

Primary implementation:

- src/modules/github/chat/drawer.js

### 3. Editor context (Send tab content)

When enabled, the drawer includes active tab context as a system message:

- Render mode and style mode
- Active tab label/path
- Available tab targets list (id/path/name/language), currently capped to 20
- Active tab source code block

This context is designed to support dynamic proposal targeting by tab id/path and reduce ambiguity.

Primary implementation:

- src/modules/github/chat/active-tab-context.js
- src/modules/github/chat/drawer.js

### 4. Tooling model

AI proposal actions currently use a function tool:

- propose_editor_update

Contract:

- target: tab id or path
- content: full replacement tab content
- language: optional disambiguation hint
- rationale: optional explanation

Primary implementation:

- src/modules/github/chat/proposals.js
- src/modules/github/chat/tab-target-resolver.js
- src/modules/github/chat/drawer.js

### 5. Apply and undo behavior

- Apply is proposal-driven and tab-target-aware (id/path resolution)
- Undo is scoped per tab (latest snapshot per tab)
- Undo UI is visible for active tab snapshot only

Primary implementation:

- src/modules/github/chat/drawer.js
- src/modules/github/chat/tab-scoped-undo-state.js

### 6. Payload size controls and summary strategy

The payload builder includes bounded-conversation controls:

- Hard byte budget: 120_000 bytes
- Direct conversation retention cap: latest 14 chat messages
- Summary cap: 3_600 characters
- Older dropped conversation turns are compacted into a rolling system summary

Primary implementation:

- src/modules/github/chat/payload.js

### 7. Fallback and transport behavior

- Streaming request path is attempted first
- Non-stream fallback is attempted on streaming failure
- Model access errors are surfaced with tailored status text

Primary implementation:

- src/modules/github/chat/drawer.js
- src/modules/github/api/chat.js

## Why this approach

- Keeps active-tab workflows lightweight and responsive
- Supports explicit user review before applying generated edits
- Preserves model guidance quality with mode/dialect policy constraints
- Reduces request-size growth with bounded message history and rolling summaries

## Possible Areas for Improvement

### 1. Hard-fit protection when system context alone is large

Current shrinking behavior primarily trims conversation turns. Add a final hard-fit step that can selectively trim editor context sections when total payload still exceeds budget.

Potential ideas:

- Trim available tab target list length adaptively
- Clip active tab source with clear truncation markers
- Retry once on 413 with reduced context envelope

### 2. Create-tab capability

Add a dedicated tool for creating workspace tabs so requests like "create a new styles tab" can be completed in one interaction.

Potential tool:

- create_workspace_tab(path, language, initialContent?, activate?)

### 3. Cross-tab source access

Support workflows where the user references a non-active tab.

Potential options:

- Add Send all tabs mode with explicit byte budgeting
- Add read_workspace_tab tool for targeted lookup

### 4. Better summary fidelity

Current summary is compact and bounded, but can lose nuanced intent over long sessions.

Potential ideas:

- Structured summary sections (goals, constraints, pending asks)
- Weighted retention for user constraints and accepted decisions

### 5. Context observability in UI

Provide optional diagnostics showing what context is being sent in the next request.

Potential ideas:

- "Preview outgoing context" drawer section
- Approximate byte-count indicator before send

### 6. Tool-call UX clarity

Continue improving copy and actions so users understand what is proposed versus what is already applied.

Potential ideas:

- Show target tab path in each action
- Add optional diff preview before apply

### 7. Optional stricter policy profiles

Allow policy strictness presets depending on user goals.

Potential ideas:

- Conservative mode: fewer tool proposals, stronger minimal-change bias
- Refactor mode: broader architectural proposal tolerance

## Validation status

Current strategy has focused Playwright coverage for the chat drawer behavior and context policy assertions in:

- playwright/github-byot-ai.spec.ts

## Scope note

This document is intentionally implementation-oriented. It describes current behavior and practical next improvements without locking future UX or API contracts.
