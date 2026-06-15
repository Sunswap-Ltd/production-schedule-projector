# Endurance Build Completion Projector

An **Airtable Interface Extension** (`@airtable/blocks`, `interface-alpha`) that projects when each
Endurance TRU build on the assembly line will reach Goods Complete. It pulls live data from Airtable
and lets the user drag sliders to model labour ramp, hours-per-build, and **WiP burn-down**, then
shows projected delivery dates, charts, and lead times.

## Commands

| Task | Command |
|------|---------|
| Run the unit tests | `npm test` |
| Watch tests | `npm run test:watch` |
| Dev server (Airtable block) | `npx block run` (see the `airtable-interface-setup` / `airtable-local-verification` skills) |
| Publish | `npx block release` (see the `airtable-publish-and-verify` skill) |

> Lint (`npm run lint`) currently fails: `.eslintrc.js` is legacy-format but eslint 9 wants a flat
> `eslint.config.js`. Pre-existing; unrelated to the model.

## The model in one line

Deliveries follow a **flow balance** (conservation of build-equivalents of work):

```
output rate = input rate − d(WiP)/dt
```

- **input rate** = labour-driven work performed *anywhere* on the line per week (`hrs ÷ hrs-per-build`). This is what KPI-376 actually measures.
- **WiP** = build-equivalents of partial work sitting on the line (KPI-132).
- **output rate** = finished builds leaving the line — this is what sets delivery dates.

Burning WiP down ships a one-off bonus of finished builds (you drain the buffer), pulling dates
**in**. Letting WiP build up starves output, pushing dates **out**. With WiP flat, output = input and
dates are throughput-bound. See [docs/MODEL.md](docs/MODEL.md) for the full derivation and the design
history (why a congestion-penalty approach was tried and rejected).

## Layout

```
frontend/
  index.js              # block entry → renders <App/>
  App.js                # UI: sliders, charts (Chart.js), delivery table, readouts
  styles.js             # inline style objects
  hooks/
    useAirtableData.js   # reads Builds + KPI Records tables → sequence, progress, WiP, history
    useSliders.js        # slider state + localStorage persistence + saved scenarios
  engine/
    constants.js         # DEFAULT_SLIDERS, SLIDER_CONFIG, UK_BANK_HOLIDAYS, HIST_WEEK_COUNT
    helpers.js           # date math, lerp, formatting
    projection.js        # THE MODEL: project(), deliveryDates(), buildScenario()
    projection.test.js   # flow-balance + delivery-date tests
    helpers.test.js      # date/lerp tests
docs/                    # MODEL.md, ARCHITECTURE.md, TESTING.md
```

The **engine** (`frontend/engine/`) is pure, framework-free logic and is the unit-tested core. The UI
layer is a thin Chart.js + React shell over it. When changing the model, change `projection.js` and its
tests; the UI only reads the per-week fields it produces.

## Conventions & gotchas

- This is an **Airtable Interface Extension**, not an Airtable scripting/automation. Always use the
  `interface-alpha` SDK and `@airtable/blocks/interface/ui` imports. Never mix with Interface app code.
- Module imports are **extensionless** (`./helpers`) — resolved by the block bundler and by Vitest's
  Vite resolver. Raw `node` cannot run them directly.
- All quantities are in **build-equivalents** (one finished build = 1.0). WiP is the *sum of fractional
  progress* across in-progress builds, matching KPI-132's definition.
- Ramp denominators (`wipRamp`, `rampWeeks`, `hpbRamp`) are clamped to ≥ 1 in
  `buildScenario()` — they divide, so a 0 would poison the projection with NaN.
- `deliveryDates()` scans cumulative **output**, never input. That distinction is the whole point of
  the model — don't revert it to `cumInput`.
