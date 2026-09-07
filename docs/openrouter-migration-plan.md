# OpenRouter Migration Plan

Plan for migrating the AI chat feature in `@knighted/develop` off the retired GitHub Models
inference API and onto OpenRouter, and for relocating chat out of the GitHub module into a
standalone `src/modules/chat` feature.

## Background

GitHub Models retired on July 30, 2026. Every request to
`https://models.github.ai/inference/chat/completions` now fails, and because the retired
host no longer answers CORS preflight the failure surfaces in the browser as a network/CORS
error rather than a clean HTTP status. The chat drawer is fully broken.

Microsoft Foundry Models is the vendor-recommended migration path, but it is a poor fit
here. It requires an Azure subscription with a payment method, per-model deployments inside
a Foundry Tools resource, and its inference endpoints are not intended for cross-origin
browser calls. That would either reintroduce the same CORS failure or force a backend into
an app whose entire premise is CDN-first and browser-only.

OpenRouter is the chosen target. It is callable directly from the browser, implements the
OpenAI `/chat/completions` specification that our request and SSE parsing code already
speaks, exposes a public model catalog, and keeps the bring-your-own-credential model
intact.

## Decisions

| Decision           | Choice                                                          |
| ------------------ | --------------------------------------------------------------- |
| Provider           | OpenRouter, direct browser `fetch`                              |
| Credential entry   | Paste field inside the chat drawer (no OAuth flow for now)      |
| Credential storage | `localStorage`, separate key from the GitHub PAT                |
| Chat gating        | Toggle button always visible; key field lives inside the drawer |
| Repository         | Chat is independent of repository selection                     |
| Model catalog      | Live fetch from `/api/v1/models`, free models grouped first     |
| Module location    | `src/modules/chat`, decoupled from `src/modules/github`         |

The chat toggle button is always rendered, regardless of any credential. The drawer itself
stays closed until the user clicks the toggle, exactly as it behaves today. Opening the
drawer with no OpenRouter key stored reveals the key field and an explainer in place of a
usable composer; the drawer does not auto-open.

Chat no longer depends on a selected repository. Local-mode users can chat to update an
editor tab with no GitHub connection at all. A selected repository remains useful context
when one is connected, but it is never a precondition.

## Implementation status (updated 2026-09-07)

### Done

- Phase 1 completed: chat extracted to `src/modules/chat` and decoupled from
  `src/modules/github` imports.
- Phase 2 completed for core runtime path:
  - OpenRouter chat completions endpoint is live.
  - OpenRouter header and error handling is implemented.
  - Streaming and fallback request paths are both wired.
  - Live verification confirmed SSE keepalive comment handling and `[DONE]` sentinel flow.
- Phase 3 completed:
  - Chat toggle remains visible regardless of GitHub PAT state.
  - Chat works with no repository selected (local mode).
  - In-drawer OpenRouter key controls are implemented with independent storage.
  - PR visibility logic was split away from chat visibility behavior.
- Security and UX hardening completed after initial migration:
  - Proposal/apply actions are intent-gated (explicit edit intent required).
  - Read-only prompts do not surface apply actions from markdown fallback.
  - Unmatched proposal targets show guidance instead of a misleading apply prompt.
  - OpenRouter key controls now reuse the GitHub PAT-style control pattern and trash icon.
- Tests and checks completed for the implemented behaviors:
  - Focused Playwright coverage added for intent gating, tab-context sending, and apply behavior.
  - Lint checks are passing.
  - Chat test coverage is split into `playwright/chat/ai-chat.spec.ts`, with PR/BYOT
    coverage retained in `playwright/github-byot-ai.spec.ts`.
  - OpenRouter migration docs are in place (`docs/openrouter-byok.md`) and cross-linked
    from README/BYOT docs.
- Phase 4 completed in runtime code:
  - Live `/api/v1/models` catalog fetch is wired in `src/modules/chat/api/models.js`.
  - Model picker groups models into Free and Paid sections.
  - Model catalog entries are filtered to tool-capable models.

### Remaining (non-blocking)

- Optional follow-up coverage:
  - Explicit targeted specs for 402/429 status messaging and catalog-fetch degradation.
- Optional UX follow-up:
  - One-time migration notice on first load after upgrade.

### Correction to a common assumption

OpenRouter's free models are **not** keyless. Every request to the OpenRouter API requires
an `Authorization: Bearer` API key, including requests for `:free` model variants. "Free"
means no per-token charge, not anonymous access. Free-model rate limits are 50 requests per
day for accounts with no purchased credits and 1000 per day once the account has purchased
at least $10 in credits.

The practical consequence: an OpenRouter key is **mandatory** for chat, not optional. The
UX still improves over the status quo, because a user can create a key and use free models
without ever spending money, but the drawer must hard-gate sending on the presence of a
key.

## Verification performed

Probed live from a browser at a non-OpenRouter origin before writing this plan, so the
plan's assumptions are measured rather than inferred.

| Check                                | Result                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------ |
| `POST /api/v1/chat/completions` CORS | Passes with `Authorization`, `Content-Type`, `Accept: text/event-stream` |
| Attribution headers CORS             | `HTTP-Referer` and `X-OpenRouter-Title` also pass preflight              |
| `GET /api/v1/models` CORS            | Accessible cross-origin, no key required                                 |
| `GET /api/v1/key` CORS               | Accessible cross-origin                                                  |
| Error body shape                     | `{"error":{"message":"User not found.","code":401}}`                     |
| Exposed response headers             | Only `content-type` and `cf-ray`                                         |
| Catalog size                         | 430 models, 21 free, 18 free with `tools` support                        |

Still unverified, because both require exhausting an account: the 402 (out of credits) and
429 (rate limited) mappings.

### Verified live with a funded key

| Check                        | Result                                                                     |
| ---------------------------- | -------------------------------------------------------------------------- |
| SSE keepalive comments       | `: OPENROUTER PROCESSING` lines do appear; `parseSseDataLine` ignores them |
| `data: [DONE]` sentinel      | Present and handled                                                        |
| Invalid model slug           | Returns **400**, not 404 — `"... is not a valid model ID"`                 |
| Tool calling on a free model | `openrouter/free` emits a real `propose_editor_update` call                |
| Apply + undo round trip      | Proposal applies to the editor tab and the undo action appears             |

## Current state

The chat code is provider-neutral almost everywhere. The message normalization, tool-call
assembly, SSE parsing, and proposal/undo machinery are all plain OpenAI-shape handling that
carries over unchanged. What is GitHub-specific is narrow: the endpoint URL, two request
headers, the rate-limit header names, the hardcoded model list, and the fact that a single
GitHub PAT authorizes both repository writes and chat.

Files in scope:

| File                                               | GitHub coupling                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------------------- |
| `src/modules/github/api/constants.js`              | Endpoint URL, default model, hardcoded model list                               |
| `src/modules/github/api/core.js`                   | `buildChatRequestHeaders`, `parseRateMetadata`, `parseErrorResponse`            |
| `src/modules/github/api/chat.js`                   | Imports the above; otherwise provider-neutral                                   |
| `src/modules/github/chat/drawer.js`                | Model select population, token gating, status copy                              |
| `src/modules/github/chat/utils.js`                 | Model-access error string heuristics                                            |
| `src/modules/github/chat/payload.js`               | None (context assembly)                                                         |
| `src/modules/github/chat/active-tab-context.js`    | None                                                                            |
| `src/modules/github/chat/proposals.js`             | None                                                                            |
| `src/modules/github/chat/tab-target-resolver.js`   | None                                                                            |
| `src/modules/github/chat/tab-scoped-undo-state.js` | None                                                                            |
| `src/modules/app-core/github-workflows.js`         | Wires `getCurrentGitHubToken` and 11 `aiChat*` DOM handles into the chat drawer |
| `src/modules/app-core/github-workflows-setup.js`   | Threads `githubAiContextState` through to chat                                  |
| `src/modules/app-core/app-composition-options.js`  | Passes `githubAiContextState` through GitHub-named plumbing                     |
| `src/modules/app-core/app-bindings-startup.js`     | Calls `syncAiChatTokenVisibility` at startup                                    |
| `src/modules/app-core/github-pr-context-ui.js`     | `syncAiChatTokenVisibility` hides the chat toggle without a PAT                 |
| `src/app.js`                                       | 11 `aiChat*` DOM handles, `githubAiContextState`                                |
| `src/index.html`                                   | Chat drawer markup, model `<select>`                                            |
| `src/styles/ai-controls.css`                       | Chat drawer and model picker rules live in a GitHub-oriented sheet              |
| `playwright/github-byot-ai.spec.ts`                | 11 route mocks of the retired endpoint                                          |
| `playwright/helpers/app-test-helpers.ts`           | `ensureAiChatDrawerOpen` sits beside the BYOT helpers                           |

## Target architecture

```
src/modules/chat/
  key-store.js              OpenRouter key persistence (mirrors github/token-store.js)
  api/constants.js          Base URL, default model, static fallback model list
  api/request.js            Headers, error parsing, rate metadata
  api/completions.js        requestChatCompletion / streamChatCompletion
  api/models.js             Model catalog fetch + free-first grouping
  drawer.js                 Chat drawer controller
  key-controls.js           In-drawer key field (add / mask / delete)
  utils.js
  payload.js
  active-tab-context.js
  proposals.js
  tab-target-resolver.js
  tab-scoped-undo-state.js
```

No index or barrel files, per the repo convention. Every import is an explicit file path.

The chat module must not import from `src/modules/github/**`. The one piece of GitHub data
chat legitimately consumes is the selected repository label shown in the drawer header, and
that arrives as an injected `getSelectedRepository` callback exactly as it does today, so
no import is required.

## Phase 1 — Extract chat into an independent feature

Chat is currently filed under `src/modules/github/` because GitHub Models was the provider
and a GitHub PAT was the credential. Neither is true after this migration. Chat becomes a
first-class, self-contained feature that has no dependency on GitHub at all: it works in
local mode with no PAT, no repository, and no GitHub API access.

This phase is a pure move and rename with **no behavior change**. Doing it first keeps the
provider swap in Phase 2 readable as a real diff instead of being buried in file churn.
Chat requests still fail at the end of this phase — the endpoint is still the retired one.

### File moves

| From                                               | To                                          |
| -------------------------------------------------- | ------------------------------------------- |
| `src/modules/github/chat/drawer.js`                | `src/modules/chat/drawer.js`                |
| `src/modules/github/chat/utils.js`                 | `src/modules/chat/utils.js`                 |
| `src/modules/github/chat/payload.js`               | `src/modules/chat/payload.js`               |
| `src/modules/github/chat/active-tab-context.js`    | `src/modules/chat/active-tab-context.js`    |
| `src/modules/github/chat/proposals.js`             | `src/modules/chat/proposals.js`             |
| `src/modules/github/chat/tab-target-resolver.js`   | `src/modules/chat/tab-target-resolver.js`   |
| `src/modules/github/chat/tab-scoped-undo-state.js` | `src/modules/chat/tab-scoped-undo-state.js` |
| `src/modules/github/api/chat.js`                   | `src/modules/chat/api/completions.js`       |
| chat constants in `github/api/constants.js`        | `src/modules/chat/api/constants.js`         |
| chat helpers in `github/api/core.js`               | `src/modules/chat/api/request.js`           |
| chat wiring in `app-core/github-workflows.js`      | `src/modules/app-core/chat-workflows.js`    |

`src/modules/github/chat/` is deleted outright. `src/modules/github/api/constants.js` is
left holding only `githubApiBaseUrl`.

### Steps

1. Move the seven files from `src/modules/github/chat/` to `src/modules/chat/`, unchanged
   apart from import paths.
2. Move `src/modules/github/api/chat.js` to `src/modules/chat/api/completions.js`.
3. Extract the chat-only helpers out of `src/modules/github/api/core.js` into
   `src/modules/chat/api/request.js`. `buildChatRequestHeaders` moves wholesale.
   `parseRateMetadata`, `parseErrorResponse`, and `toApiError` are currently shared with
   the GitHub REST helpers, so they get copied into the chat module and then diverge in
   Phase 2. The GitHub copies stay where they are and keep their GitHub semantics.
4. Move the chat constants out of `src/modules/github/api/constants.js`.
5. Drop the `GitHub` infix from every chat identifier: `requestGitHubChatCompletion` becomes
   `requestChatCompletion`, `streamGitHubChatCompletion` becomes `streamChatCompletion`,
   `defaultGitHubChatModel` becomes `defaultChatModel`, `createGitHubChatDrawer` becomes
   `createChatDrawer`. Rename at every call site rather than leaving alias exports behind —
   an alias would preserve exactly the coupling this phase exists to remove.
6. Split the chat drawer wiring out of `src/modules/app-core/github-workflows.js` into
   `src/modules/app-core/chat-workflows.js`, and route the 11 `aiChat*` DOM handles in
   `src/app.js` to it directly. `github-workflows.js` should stop receiving them entirely,
   as should `github-workflows-setup.js` and `app-composition-options.js`.
7. Separate chat state from `githubAiContextState`. That object currently mixes the PAT,
   the selected repository, writable repositories, and PR context — all GitHub concerns —
   with chat's needs. Chat should receive only injected getters, never the state object.
8. Extract the chat drawer and model picker rules from `src/styles/ai-controls.css` into a
   chat-specific stylesheet, or at minimum confirm the sheet is not GitHub-scoped in a way
   that breaks when chat renders without a PAT.
9. Move `ensureAiChatDrawerOpen` out of `playwright/helpers/app-test-helpers.ts` alongside
   the new chat specs.

### Definition of done for independence

The refactor is complete when all of the following hold:

- No file under `src/modules/chat/**` imports from `src/modules/github/**`.
- No file under `src/modules/github/**` imports from `src/modules/chat/**`.
- No identifier in the chat module contains `GitHub`.
- Chat's only knowledge of GitHub is via injected callbacks (`getSelectedRepository`), each
  of which tolerates a null return.
- Deleting the entire `src/modules/github/` tree would leave chat syntactically intact.

That last one is a thought experiment, not a task — but it is the bar. If it is not true,
chat is not actually independent.

Verification: `npm run lint`, then a manual `npm run dev` smoke test confirming the drawer
still opens and renders.

## Phase 2 — Swap the provider

1. **Endpoint.** `https://openrouter.ai/api/v1/chat/completions`.
2. **Headers.** `Authorization: Bearer <key>`, `Content-Type: application/json`, and
   `Accept: text/event-stream` or `application/json` depending on `stream`.
   **Remove `X-GitHub-Api-Version`.** An unrecognized custom header forces a preflight and
   buys us nothing against OpenRouter.
3. **Attribution headers.** `HTTP-Referer` and `X-OpenRouter-Title` are optional and only
   affect OpenRouter leaderboard visibility. Both are verified to pass preflight from a
   browser origin, so adopting them is purely a product call. Defer unless leaderboard
   presence is wanted.
4. **Request body.** Unchanged. `model`, `messages`, `stream`, `tools`, `tool_choice` all
   map directly. Continue omitting `metadata` — the constraint that originally forced
   context into message content is unchanged by this migration, and the strategy documented
   in `docs/ai-chat-context-and-payload-strategy.md` remains correct.
5. **Streaming.** The existing SSE reader carries over. `parseSseDataLine` already ignores
   any line that does not start with `data:`, so OpenRouter's `: OPENROUTER PROCESSING`
   keepalive comments should be dropped harmlessly. This is the one item that could not be
   verified without a funded key — confirm against a live stream as the first task of
   Phase 2.
6. **Error shape.** Verified: OpenRouter returns `{ error: { message, code } }`, with the
   status code duplicated inside `error.code`. GitHub's flat `{ message }` shape is gone.
   `parseErrorResponse` needs a branch for the nested shape, keeping the flat shape as a
   fallback.
7. **Error classification.** Replace the string sniffing in `utils.js` with status-code
   mapping, keeping the string matching only as a last resort:

   | Status | Meaning                | Drawer message                                       |
   | ------ | ---------------------- | ---------------------------------------------------- |
   | 400    | Unknown model slug     | Model unavailable; pick another                      |
   | 401    | Invalid or revoked key | Key rejected; re-enter or create a new one           |
   | 402    | Out of credits         | Out of credits; add credits or pick a free model     |
   | 429    | Rate limited           | Free-model daily limit reached, or too many requests |

   The 402 and 429 cases are the ones users on free models will actually hit, so their copy
   should name the free-model limits explicitly and point at the free-model filter in the
   picker. 400 and 401 are verified live. 402 and 429 remain unverified, since provoking
   them means exhausting an account.

8. **Rate metadata.** Delete header-based rate parsing entirely rather than porting it.
   Verified: OpenRouter exposes only `content-type` and `cf-ray` to browser JavaScript via
   `Access-Control-Expose-Headers`. Even if rate-limit headers are sent, they are
   unreadable cross-origin, so `parseRateMetadata` would always return nulls. If a usage
   indicator is wanted, `GET /api/v1/key` is CORS-accessible and reports limit and
   remaining credits.

## Phase 3 — In-drawer key entry

The key field lives in the chat drawer, directly under the status line in
`src/index.html`, above the messages list. It is visible when no key is stored and collapses
to a masked summary with a delete button once a key is saved — the same
add / mask / delete affordance already used by the GitHub token control, reusing its
iconography and privacy copy so the two credential surfaces feel like one system.

1. `src/modules/chat/key-store.js` mirrors `src/modules/github/token-store.js` exactly:
   `loadOpenRouterKey`, `saveOpenRouterKey`, `clearOpenRouterKey`, `maskOpenRouterKey`,
   every `localStorage` access wrapped in try/catch. Storage key
   `knighted:develop:openrouter-key`.
2. `src/modules/chat/key-controls.js` owns the field, emitting `onKeyChange` so the drawer
   can re-run model fetch and re-enable send.
3. Explainer copy shown when no key is present must state plainly that a key is required
   even for free models, that free models cost nothing but are limited to 50 requests per
   day without purchased credits, and that the key never leaves the browser. Link to
   `https://openrouter.ai/keys`.
4. Disabled state: with no key, the prompt textarea, send button, and model select are
   disabled and the status line reads as guidance rather than an error.

### Gating changes

`syncAiChatTokenVisibility` in `src/modules/app-core/github-pr-context-ui.js` is the
highest-risk piece of this migration. It is a single function doing four unrelated jobs,
keyed off one credential:

1. Shows/hides the chat toggle.
2. Shows/hides the PR toggle.
3. Tears down PR context state (`activePrContext`, `activePrEditorSyncKey`,
   `hasSyncedActivePrEditorContent`) when the PAT goes away.
4. Resets editor PR indicators and the PR toggle visual.

Only job 1 concerns chat. Extract it and delete it — the chat toggle is never hidden — then
rename the remainder to `syncPrSurfaceVisibility` so the name matches what it actually
does. Its call site at `github-workflows.js` and its `getTokenForVisibility` plumbing stay
intact for the PR surfaces.

Watch for these specific gaps while doing it:

- `aiChatToggle` is currently passed into `github-pr-context-ui.js` purely for job 1. Remove
  the parameter entirely rather than leaving it unused, so nothing can quietly re-couple.
- The `aria-expanded="false"` reset on the chat toggle in the no-token branch disappears
  with job 1. Confirm the drawer's own `setOpen` is the sole owner of that attribute.
- The chat toggle's initial hidden state in `src/index.html` must be removed, or the toggle
  will start hidden with nothing left to reveal it.
- Deleting the PAT currently closes the chat drawer as a side effect of hiding the toggle.
  After the split, deleting the PAT must leave an open chat drawer open and functional.

Resulting matrix:

| GitHub PAT | OpenRouter key | Chat toggle | Chat drawer contents     | PR / push |
| ---------- | -------------- | ----------- | ------------------------ | --------- |
| absent     | absent         | Visible     | Key field + explainer    | Hidden    |
| absent     | present        | Visible     | Fully usable, local mode | Hidden    |
| present    | absent         | Visible     | Key field + explainer    | Available |
| present    | present        | Visible     | Fully usable, repo label | Available |

### Repository independence

Chat previously could not exist without a PAT, so "no repository" was unreachable. Audit
these for implicit repository assumptions before declaring the state supported:

- The drawer's repository label already handles a null repository via `toRepositoryLabel`,
  which returns "No repository selected". Decide whether to render that string or hide the
  label row entirely in local mode — the former reads like a warning for a state that is
  now perfectly normal.
- `payload.js` context assembly, `active-tab-context.js`, `tab-target-resolver.js`, and
  `proposals.js` need checking for anywhere a repository full name is assumed present when
  building context or resolving a proposal target.
- System-prompt copy that references the connected repository must degrade cleanly when
  there is none.

### Credential isolation

This is the security-relevant part of the migration and deserves explicit tests.

- The PAT must never be sent to `openrouter.ai`, and the OpenRouter key must never be sent
  to `api.github.com`. The two getters stay separate all the way down; no shared "token"
  parameter.
- No silent migration. A user with a stored PAT and no OpenRouter key gets the key prompt,
  not a copied credential.
- One-time notice on first load after upgrade explaining that GitHub Models was retired and
  that chat now needs an OpenRouter key.
- Deleting the GitHub token must not delete the OpenRouter key, and vice versa.

## Phase 4 — Model catalog

Verified against the live endpoint from a non-OpenRouter browser origin: the catalog is
CORS-accessible without a key, currently returns 430 models, of which 21 are free and 18 of
those 21 advertise tool support.

1. `src/modules/chat/api/models.js` fetches `GET https://openrouter.ai/api/v1/models` lazily
   on first drawer open and caches the result in memory for the session. No key is needed
   for the catalog itself, so the picker can be populated before the user supplies one.
2. A model is free when `pricing.prompt` and `pricing.completion` are both `"0"`. Group the
   `<select>` into a "Free" `<optgroup>` first and "Paid" second, so the zero-cost path is
   the discoverable default.
3. Filter to models whose `supported_parameters` array includes `"tools"`. The editor
   proposal flow depends on `tools` / `tool_choice`, and a model without tool support fails
   silently rather than erroring. This drops the free set from 21 to 18 and the full
   catalog to a far more navigable size.
4. Default selection is a specific free, tool-capable slug pinned as a constant rather than
   inferred, so behavior is deterministic when the catalog fetch fails. Note that free slugs
   churn — the pinned default needs a periodic sanity check, and an unknown-model 404 on the
   default must fall back to the picker rather than dead-ending.
5. Static fallback list in `src/modules/chat/api/constants.js` for fetch failure, consistent
   with the CDN fallback philosophy in `src/modules/cdn.js`. A catalog fetch failure must
   not disable chat.

## Phase 5 — Tests and docs

### Playwright

- Retarget all 11 `page.route` mocks in `playwright/github-byot-ai.spec.ts` from
  `https://models.github.ai/inference/chat/completions` to
  `https://openrouter.ai/api/v1/chat/completions`, and add a mock for
  `https://openrouter.ai/api/v1/models`.
- Split the spec. Chat is no longer a GitHub feature, so the chat cases move to
  `playwright/chat/` and `github-byot-ai.spec.ts` keeps only PR/BYOT coverage.
- `connectByotWithSingleRepo` in `playwright/helpers/app-test-helpers.ts` grows a sibling
  helper for connecting an OpenRouter key, so specs can set up either credential
  independently.
- The existing "chat stays hidden until token connect" case encodes the old coupling and is
  rewritten, not patched. Replace it with coverage of all four cells of the gating matrix,
  asserting the chat toggle is visible in every one.
- Assert the chat drawer stays closed until the toggle is clicked, in all four cells.
- Assert that deleting the GitHub PAT while the chat drawer is open leaves it open and
  functional.
- Add local-mode chat specs with no PAT at all: send a message, apply a proposal to an
  editor tab, and undo it, with no repository selected at any point.
- Add a spec asserting no request to `openrouter.ai` carries the PAT, and no request to
  `api.github.com` carries the OpenRouter key.
- Add coverage for the free-model grouping, the 402 and 429 error messages, and graceful
  degradation when the catalog fetch fails.
- Follow the repo's accessible-selector convention for the new key field: label it and
  reach it with `getByLabel`, not a CSS locator.

### Docs

- New `docs/openrouter-byok.md` covering key creation, free-model limits, and the
  browser-local storage guarantee.
- `docs/byot.md` narrows to the GitHub PAT and cross-links the new doc.
- `docs/ai-chat-context-and-payload-strategy.md` file paths updated for the move.
- `docs/localstorage-state.md` gains the new storage key.
- The in-app token info panel and the doc link in `src/index.html` updated to describe two
  independent, optional-in-different-ways credentials.
- `README.md` chat section updated.

## Risks

| Risk                                            | Status   | Mitigation                                                                                                                                                     |
| ----------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser CORS on `/chat/completions`             | Resolved | Verified: preflight passes with `Authorization`, `Content-Type`, `Accept: text/event-stream`                                                                   |
| Browser CORS on `/api/v1/models`                | Resolved | Verified: accessible cross-origin, no key required                                                                                                             |
| Free models lack tool support                   | Resolved | Verified: 18 of 21 free models advertise `tools` in `supported_parameters`                                                                                     |
| Rate-limit headers unreadable in browser        | Resolved | Verified: only `content-type` and `cf-ray` exposed. Drop header parsing; use `/api/v1/key` if needed                                                           |
| SSE keepalive comments break the stream reader  | Resolved | Verified live with a funded key; keepalive comments are ignored and stream completion is handled correctly                                                     |
| 402/404/429 mappings unconfirmed                | Partial  | 400 invalid model behavior is verified; 402 out-of-credits and 429 rate-limit remain to be validated against exhausted-account conditions                      |
| `syncAiChatTokenVisibility` split leaves gaps   | Resolved | Chat visibility is decoupled from PAT gating; PR surface visibility remains PAT-scoped                                                                         |
| Repository-independent chat hits untested paths | Partial  | Core no-repository behavior is implemented and covered by focused tests; broader cross-browser matrix coverage remains                                         |
| Pinned default free slug goes away              | Open     | 404 on default falls back to the picker; periodic sanity check                                                                                                 |
| 50 req/day free limit feels broken to users     | Open     | Explicit 429 copy naming the limit and the credits threshold                                                                                                   |
| Key in `localStorage` is XSS-exposed            | Accepted | Same threat model as the existing PAT; document it, and note the OpenRouter key is scoped to inference spend only, unlike the PAT which can write repositories |
| Phase 1 rename churn hides regressions          | Accepted | Keep Phase 1 as a pure move with no behavior change and lint/smoke before Phase 2                                                                              |

## Out of scope

- OAuth PKCE connect flow. Better UX than a paste field and worth revisiting, but it is a
  larger change and the paste field matches the existing BYOT pattern.
- Microsoft Foundry support. The provider seam introduced in Phase 1 leaves room for a
  second implementation, but nothing here should be generalized speculatively for it.
- Any change to the context assembly, proposal, or undo behavior. Those files move and are
  otherwise untouched.

## Approvals needed

Per `AGENTS.md`, confirm before implementation starts:

- Module relocation and identifier renames, which change file layout and documented paths.
- The gating change making chat independent of the GitHub PAT, which is user-visible
  behavior documented in the README.
- No new dependencies are proposed; the migration is plain `fetch` throughout.
