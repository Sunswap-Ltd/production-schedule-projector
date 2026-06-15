# Architecture & data flow

## Overview

```
Airtable (Builds + KPI Records)
        │  @airtable/blocks/interface/ui  (useBase, useRecords)
        ▼
useAirtableData()  ──►  { sequence, progress, currentWip, history…, projFirstMon }
        │
        ├─ useSliders()  ──►  slider state (localStorage-backed)
        ▼
buildScenario(sliders)  ──►  scenario  ─► project(scenario, currentWip, projFirstMon)  ─► proj[]
                                              │
                                              ▼
                                      deliveryDates(proj, …)  ─► dated build schedule
        │
        ▼
App.js  ──►  Chart.js charts + delivery table + readouts
```

The **engine** (`frontend/engine/`) is pure functions with no React/Airtable dependency — that's why it
is unit-testable in isolation. Everything Airtable- or DOM-specific lives in hooks and `App.js`.

## Airtable data contract

`useAirtableData()` requires two tables and these fields (it reports `missingFields` if any are hidden
in the interface):

**`Builds`** — `Assembly Line`, `Line Slots`, `Build ID`, `First End User` / `End User`,
`Scheduled Completion`, `Goods Status`, `Progress`, `Actual Goods Complete Date`.
- Filters to builds whose `Assembly Line` contains "Endurance", sorted by `Line Slots`.
- `currentWip` = Σ capped `Progress` over builds with status `In Progress - Assembling`.

**`KPI Records`** — `KPI`, `Type` (only `Actual` rows used), `Date`, `Metric`. Three series, bucketed
into a rolling `HIST_WEEK_COUNT` (6) week window:

| KPI | Meaning | Field produced |
|-----|---------|----------------|
| KPI-132 | Weekly WiP (end-of-week) | `histWipWeekly` |
| KPI-356 | Total direct assembly hours | `histTotalHrs` / `histEndHrs` |
| KPI-376 | Daily build-equivalents (the **input rate**) | `histEndBuilds` |

`histWarnings` flags weeks with fewer data points than working days (incomplete data, surfaced as ⚠ on
charts).

## Per-week projection fields (`project()` output)

Each element of `proj[]` carries: `week`, `monday`, `hrs`, `nominalHrs`, `hpb`, `inputRate`,
`outputRate`, `cumInput`, `cumOutput`, `wip`, `wipChange`, `leadTimeWeeks`, `workingDays`, `techs`.
The UI reads these directly; `deliveryDates()` uses `cumOutput`.

## Sliders

Defined in `constants.js` (`DEFAULT_SLIDERS` + `SLIDER_CONFIG`), grouped `scenario` vs `headcount`,
rendered generically by `App.js`. `useSliders()` persists to `localStorage` and supports named saved
scenarios. Scenario sliders include: `targetWip`, `wipRamp`, tech ramp, hrs-per-build ramp,
horizon, plus a non-slider `startSlot` (which build to start the schedule from).

## UI (`App.js`)

- Two tabs: **Charts** (hours, hrs/build, WiP path, production rate) and **Delivery Schedule** (table).
- Charts are imperative Chart.js instances wrapped in `ChartCanvas` (updates in place, no reanimation).
- The WiP chart is followed by a **flow-balance + lead-time readout** computed in the projection memo.
- KPI reference chips (e.g. "KPI-132") expand the corresponding KPI metadata record.
