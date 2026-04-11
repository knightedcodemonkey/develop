## Plan: Issue 62 Remaining Hardening

Deliver focused hardening in @knighted/develop by executing the remaining focus areas in the listed priority order, while adding deterministic tests around each behavior contract. Keep changes localized to tab-state orchestration, iframe preview/runtime plumbing, and workspace module resolution; avoid broad UX redesign.

**Steps**

1. Phase 1: Remove/Add/Rename Coherence (Focus area 1)
2. Add deterministic Playwright coverage for remove fallback ordering: removing active non-entry tab selects the next deterministic tab by workspace order, and removing non-active tab does not change active tab.
3. Tighten remove flow in app orchestration to keep active tab id, loaded editor lane ids, and visible editor panel synchronized after deletion; verify no stale lane id references survive tab removal.
4. Add invariants for add/rename synchronization so name/path/content stay aligned in single upsert operations, including rapid rename after add and repeated rename collisions.
5. Extend rename behavior to preserve entry filename contract while ensuring metadata persistence (role, language, path) remains coherent under fast user interactions.
6. Phase 2: Tab-ID-First Activation Hardening (Focus area 2) (depends on Phase 1)
7. Enforce active tab id as the only activation source across tab click, keyboard focus, and programmatic activation flows; reject stale/hidden-panel driven activation attempts.
8. Add guard tests for hidden panel interactions: toggling/collapsing panels during tab switches cannot mutate active tab state or write editor content to the wrong tab.
9. Validate content persistence order around activation: active editor content is flushed before tab transition, and editor pool activation always occurs after visibility state is set.
10. Phase 3: Entry and Startup Determinism (Focus area 3) (depends on Phases 1-2)
11. Stabilize startup restore sequence by validating stored active tab id against restored tab graph, then loading editor lane strictly from resolved active id.
12. Add resilience tests for corrupted or stale persisted records (missing active tab id, missing entry tab, stale role metadata), ensuring deterministic fallback behavior.
13. Lock preview entry resolution to entry-role metadata contract with documented fallback when role metadata is invalid or absent.
14. Add startup sequencing checks so first render cannot run with stale default editor content before workspace hydration completes.
15. Phase 4: Workspace Import Specifier Compatibility (Focus area 4) (parallel with Phase 5 once startup contract is stable)
16. Implement deterministic resolver ordering contract: exact module-key match first, extension-compat fallback second (.ts/.tsx/.js/.jsx/.mjs), with explicit ambiguity detection and surfaced diagnostics.
17. Add tests for ESM-style .js specifiers resolving to .ts/.tsx workspace tabs when exact .js target does not exist; add ambiguity tests where multiple candidates exist.
18. Preserve deterministic circular/missing module diagnostics while integrating extension-compat behavior.
19. Phase 5: Extension-Driven Tab Kind Detection (Focus area 5) (parallel with Phase 4)
20. Update add-tab flow to require explicit type selection (Component or Styles) per user decision; remove Auto default behavior from creation flow.
21. Add extension/path inference utility used during add and rename for language/tooling alignment, while explicit add selection overrides extension inference for initial creation.
22. Ensure rename can reclassify tab kind by extension (.css/.less/.sass/.scss/.module.css semantics) and keep editor language, panel tools, and render pipeline wiring in sync.
23. Add Playwright coverage for creating and renaming style-extension tabs and verifying styles-lane behavior.
24. Phase 6: React Runtime Correctness in Iframe Preview (Focus area 6) (depends on Phases 2-3)
25. Audit and harden runtime prelude + transpile option parity between DOM and React modes so generated modules always bind expected runtime helpers for current mode.
26. Investigate and fix children-related runtime regression path in iframe execution, including stale module execution, transform output mismatch, and mode-switch residue.
27. Strengthen iframe runtime bridge state reset on mode switches/rerenders so stale caches/fingerprints do not mask or replay outdated runtime failures.
28. Add targeted e2e regression test for children-prop component usage across DOM/React mode transitions and repeated rerenders.
29. Phase 7: Render Cadence and Stale-Error Recovery (Focus area 7) (depends on Phase 6)
30. Verify render scheduling, disposal, and rerender queue behavior under rapid tab churn and mode switches; ensure stale module graphs are fully disposed.
31. Tune runtime error dedupe lifecycle to avoid noisy duplicates while still allowing deterministic recovery signaling after user fixes.
32. Add stress-style tests for repeated source edits, rapid mode flips, and recovery from runtime/transform errors without unrelated edits.
33. Validation and release-readiness (depends on all phases)
34. Run lint/build and only the relevant e2e specs for touched behavior during iteration; reserve full e2e suite for end-of-work handoff.
35. Update docs only if any user-visible behavior contract changed (especially add-tab type selection and resolver ambiguity reporting).

**Relevant files**

- /Users/morgan/knighted/develop/src/app.js — primary tab activation, add/remove/rename, startup restore, editor lane visibility, persistence orchestration.
- /Users/morgan/knighted/develop/src/modules/workspace-tabs-state.js — active tab id state machine and deterministic fallback logic.
- /Users/morgan/knighted/develop/src/modules/workspace-storage.js — persisted record normalization and tab metadata consistency.
- /Users/morgan/knighted/develop/src/modules/preview-entry-resolver.js — entry tab resolution contract and fallback behavior.
- /Users/morgan/knighted/develop/src/modules/preview-runtime/virtual-workspace-modules.js — module planning, extension-compatible specifier resolution, runtime prelude injection, blob lifecycle.
- /Users/morgan/knighted/develop/src/modules/preview-runtime/workspace-hydration.js — module key derivation from tab metadata.
- /Users/morgan/knighted/develop/src/modules/preview-runtime/iframe-preview-executor.js — iframe error bridge, runtime error dedupe/fingerprinting, execution bootstrap.
- /Users/morgan/knighted/develop/src/modules/render-runtime.js — render scheduling, mode dispatch, module disposal, runtime error normalization/surfacing.
- /Users/morgan/knighted/develop/playwright/rendering-modes.spec.ts — runtime mode switching and runtime error surfacing regression tests.
- /Users/morgan/knighted/develop/playwright/diagnostics.spec.ts — diagnostics reporting expectations and classification.
- /Users/morgan/knighted/develop/playwright/helpers/app-test-helpers.ts — tab operation and editor interaction helpers used by new coverage.

**Verification**

1. Add/adjust Playwright scenarios for each phase before implementation finalization of that phase to lock behavior.
2. During iteration, run only relevant Playwright specs for the behavior being changed (for example: runtime-only, tabs-only, diagnostics-only) to keep feedback fast.
3. Run npm run lint in /Users/morgan/knighted/develop after JS edits.
4. Run npm run build in /Users/morgan/knighted/develop after runtime/resolution/startup path edits.
5. Keep full npm run test:e2e as final end-of-work validation gate.
6. Manual verification matrix: startup restore, entry tab stability, tab add/rename/remove determinism, .js to .ts/.tsx specifier resolution, style-extension tab behavior, children-prop runtime behavior across DOM/React switching.

**Decisions**

- Keep implementation priority in the exact order already listed in issue 62 prompt focus areas.
- Add-tab creation will require explicit type choice (Component or Styles); no Auto default in the add flow.
- Scope is limited to @knighted/develop runtime/state/test/docs touchpoints; no dependency additions and no broad UI redesign.
- Implementation structure rule: reuse existing modules first; when new modules are required, colocate them under existing parent module directories and keep responsibilities split (no monolithic new implementation file).
- Preserve existing preference: keep error surfacing in PR drawer status context and avoid introducing app-level error toast behavior changes.

**Further Considerations**

1. Resolver ambiguity UX: recommend deterministic hard error with candidate list in diagnostics over silent first-match behavior.
2. Runtime dedupe lifecycle: recommend resetting dedupe state per render cycle boundary (not global session) to improve stale-error recovery determinism.
3. For rename-driven reclassification, recommend preserving tab id while migrating language/kind metadata to avoid persistence churn.
