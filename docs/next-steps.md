# Next Steps

Focused follow-up work for `@knighted/develop`.

1. **In-browser component testing**
   - Explore authoring and running component-focused tests in-browser (for example, a Vitest-compatible flow) using CDN-delivered tooling.
   - Define a lightweight test UX that supports writing tests, running them on demand, and displaying results in-app.

2. **CDN failure recovery UX**
   - Detect transient CDN/module loading failures and surface a clear recovery action in-app.
   - Add a user-triggered retry path (for example, Reload page / Force reload) when runtime bootstrap imports fail.
   - Consider an optional automatic one-time retry before showing recovery controls, while avoiding infinite reload loops.

3. **Deterministic E2E lane in CI**
   - Add an integration-style E2E path that uses locally served/pinned copies of CDN runtime dependencies for test execution, while keeping production runtime behavior unchanged.
   - Keep the current true CDN-backed E2E path as a separate smoke check, but make the deterministic lane the required gate for pull requests.
   - Run this deterministic E2E suite on **every pull request** in CI.
   - Ensure the deterministic lane still exercises the same user-facing flows (render, typecheck, lint, diagnostics drawer/button states), only swapping the source of runtime artifacts.
   - Suggested implementation prompt:
     - "Add a deterministic E2E execution mode for `@knighted/develop` that serves pinned runtime artifacts locally (instead of live CDN fetches) and wire it into CI as a required check on every PR. Keep a separate lightweight CDN-smoke E2E check for real-network coverage. Validate with `npm run lint`, deterministic Playwright PR checks, and one CDN-smoke Playwright run."

4. **Evaluate GitHub file upsert request strategy (metadata-first vs optimistic PUT)**
   - Revisit the current metadata-first `upsertRepositoryFile` approach and compare it against an optimistic PUT + targeted retry-on-missing-sha flow.
   - Measure tradeoffs for latency, GitHub API request count/rate-limit impact, and browser-console signal quality during common PR flows.
   - If beneficial, introduce a configurable/hybrid strategy (for example, optimistic default with metadata fallback) without regressing current reliability.
   - Suggested implementation prompt:
     - "Evaluate and optionally optimize @knighted/develop GitHub file upsert behavior. Compare metadata-first preflight GET+PUT against optimistic PUT with retry-on-missing-sha for existing files. Keep current reliability guarantees and avoid reintroducing noisy false-positive failures. If implementing a hybrid/configurable strategy, keep defaults conservative, update docs, and validate with npm run lint plus targeted Playwright PR drawer flows."

5. **Document async handling conventions (consistency of intent)**
   - The codebase already uses `async`/`await` for most multi-step async control flow.
   - Keep Promise chains where they better express intent, such as concurrent composition,
     concise pass-through composition, or fire-and-forget paths with explicit `.catch()` to
     avoid unhandled rejections.
   - Document this intent-first convention for future changes and code review. Do not pursue
     a broad refactor or add a rigid lint rule solely to make syntax uniform.
   - Suggested implementation prompt:
     - "Document the existing async handling convention in @knighted/develop: prefer
       async/await for multi-step control flow, allow Promise chains for deliberate
       concurrency or fire-and-forget work, and require explicit rejection handling for
       unawaited promises. Make only targeted cleanup changes where intent is unclear."

6. **Render model Markdown responses as safe HTML**
   - Evaluate rendering assistant Markdown as formatted HTML instead of displaying the
     response as plain text, including fenced code blocks, inline code, links, lists, and
     other common response structures.
   - Compare small browser-compatible Markdown parsers that work with the CDN-first
     runtime, such as `marked` or `markdown-it`, and load the chosen dependency lazily
     through the existing CDN provider and fallback mechanism.
   - Treat model output as untrusted input. Pair Markdown rendering with an explicit HTML
     sanitization policy, such as DOMPurify or an equivalent sanitizer, and restrict link
     protocols and external navigation behavior.
   - Preserve the raw Markdown response for proposal extraction, streaming updates, and
     conversation state; rendered HTML should be a presentation layer only.
   - Define behavior for incomplete streamed Markdown, unsupported syntax, rendering
     failures, and environments where the CDN dependency cannot be loaded. Plain-text
     rendering should remain a usable fallback.
   - Suggested implementation prompt:
     - "Add safe Markdown rendering for @knighted/develop AI chat responses. Evaluate a
       small CDN-compatible parser such as marked or markdown-it plus an HTML sanitizer,
       load both lazily through the existing CDN fallback system, preserve raw Markdown
       for proposal extraction and chat state, and keep plain-text rendering as the
       failure fallback. Handle streamed/incomplete Markdown, safe links, code blocks,
       and XSS cases. Validate with npm run lint and focused Playwright chat coverage."
