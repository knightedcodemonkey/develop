# Preview Sandbox Benchmark

This benchmark captures preview-runtime timing before and after sandbox changes.

## Metrics

- First render latency
- Median auto-render latency across 20 edits
- p95 auto-render latency across 20 edits
- Runtime diagnostic arrival latency after a known runtime error

## Setup

1. Start the app with `npm run dev`.
2. Open the app in a fresh browser tab.
3. Open DevTools console and run:

```js
window.__KNIGHTED_PREVIEW_TELEMETRY__ = []
```

4. Confirm auto-render is enabled.

## Manual run

1. Wait for the initial render to complete.
2. Make 20 quick edits in the component editor (append a character, then remove it).
3. Trigger one known runtime error (for example, throw inside `App`).
4. In the console, run:

```js
const events = Array.isArray(window.__KNIGHTED_PREVIEW_TELEMETRY__)
  ? window.__KNIGHTED_PREVIEW_TELEMETRY__
  : []

const byName = name => events.filter(event => event?.name === name)

const renderStarts = byName('render-start')
const renderCompletes = byName('render-complete')
const iframeReady = byName('iframe-ready')
const rendered = byName('rendered')
const runtimeErrors = byName('runtime-error')

const pairDurations = (starts, ends) => {
  const count = Math.min(starts.length, ends.length)
  const durations = []

  for (let index = 0; index < count; index += 1) {
    const start = starts[index]?.at
    const end = ends[index]?.at
    if (typeof start === 'number' && typeof end === 'number' && end >= start) {
      durations.push(end - start)
    }
  }

  return durations
}

const quantile = (values, ratio) => {
  if (!Array.isArray(values) || values.length === 0) {
    return null
  }

  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * ratio) - 1),
  )

  return sorted[index]
}

const renderDurations = pairDurations(renderStarts, renderCompletes)
const firstRenderLatency = renderDurations[0] ?? null
const autoRenderDurations = renderDurations.slice(1, 21)

const diagnosticsLatency = (() => {
  const firstRuntimeError = runtimeErrors[0]
  const firstRendered = rendered[0]
  if (
    !firstRuntimeError ||
    typeof firstRuntimeError.at !== 'number' ||
    !firstRendered ||
    typeof firstRendered.at !== 'number'
  ) {
    return null
  }

  return firstRuntimeError.at - firstRendered.at
})()

console.table({
  firstRenderLatency,
  autoRenderMedian: quantile(autoRenderDurations, 0.5),
  autoRenderP95: quantile(autoRenderDurations, 0.95),
  diagnosticsLatency,
  iframeReadyEvents: iframeReady.length,
  runtimeErrorEvents: runtimeErrors.length,
})
```

## Notes

- Rerun if CDN failures occur because runtime imports are network-backed.
- Compare baseline and updated runs using the same browser and machine state.
