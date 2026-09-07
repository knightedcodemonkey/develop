# OpenRouter BYOK Setup for AI Chat in @knighted/develop

This guide explains how to create and use an OpenRouter API key for AI chat in `@knighted/develop`.

## What this key does

The OpenRouter key is used only for AI chat requests and model catalog requests in the chat drawer.

- It enables chat completions against `https://openrouter.ai/api/v1/chat/completions`.
- It enables loading model options from `https://openrouter.ai/api/v1/models`.

The key is independent from the GitHub PAT used by PR and repository workflows.

## Free model limits

OpenRouter free models still require an API key.

- Free models have no per-token charge.
- Accounts without purchased credits are currently limited to 50 requests per day.
- Accounts that have purchased at least $10 in credits are currently limited to 1000 requests per day.

## Privacy and storage behavior

- Your OpenRouter key is stored only in your browser `localStorage`.
- The key is sent only to OpenRouter endpoints used by chat.
- The key is never sent to GitHub endpoints.
- You can remove it any time from the chat drawer key controls.

## Create and connect an OpenRouter key

1. Open https://openrouter.ai/keys and create an API key.
2. Open the Chat drawer in `@knighted/develop`.
3. Paste the key into the `OpenRouter API key` input.
4. Click `Save OpenRouter API key`.
5. Send a test prompt and confirm the assistant response appears.

## Related docs

- GitHub PAT setup for PR/repository workflows: [byot.md](byot.md)
- Local storage keys: [localstorage-state.md](localstorage-state.md)
