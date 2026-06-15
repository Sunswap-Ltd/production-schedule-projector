# Testing

Unit tests cover the **engine** (`frontend/engine/`) — the pure model logic. The React/Airtable/Chart.js
UI is verified separately by running the extension (see the `airtable-local-verification` skill).

## Running

```bash
npm test          # one-shot run (vitest run)
npm run test:watch
```

[Vitest](https://vitest.dev) is used because its Vite resolver handles the project's extensionless
imports (`./helpers`) the same way the Airtable block bundler does — so the engine is tested exactly as
it ships, with no build step or `node` import-resolution workarounds.

## What's covered

`frontend/engine/projection.test.js`
- **`buildScenario`** — ramp clamps to ≥ 1 (no NaN).
- **Flow balance** — flat WiP ⇒ output = input; burn-down ⇒ `cumOutput = cumInput − (WiP − WiP0)` and
  the total delivery bonus equals the WiP drained; build-up ⇒ output < input; output never negative;
  lead time = WiP/output.
- **Delivery dates** — burning WiP down pulls the final delivery earlier than flat; building WiP up
  pushes it later; **no WiP change ⇒ schedule is independent of WiP level** (throughput-bound); actual
  goods-complete dates honoured; cadence computed.

`frontend/engine/helpers.test.js`
- `lerp` clamping, date math (`addDays`, `parseDate`/`isoDay` round-trip, Monday helpers), `fmtNum`.

## Adding tests

Put `*.test.js` next to the module it covers under `frontend/engine/`. Use the `sliders()` helper in
`projection.test.js` for a complete slider set and override only what the test needs. Pick a
holiday-free Monday (the `MON` constant) when you want working-days = 5 so labour math is deterministic.

When you change the model, the **delivery-date direction tests** are the guard rail: burn-down must pull
dates in, build-up must push them out, and flat WiP must be level-independent. If those break, the flow
balance has been broken.
