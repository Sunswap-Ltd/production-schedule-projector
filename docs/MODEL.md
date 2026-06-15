# The projection model

This document explains how delivery dates are computed, the physics behind it, and the design history
that led here. The implementation is in [`frontend/engine/projection.js`](../frontend/engine/projection.js).

## 1. What we're projecting

Given a sequence of Endurance builds (ordered by line slot) and their current progress, project the
calendar date each one reaches **Goods Complete**, under a scenario set by the sliders (labour, ramp,
WiP target).

## 2. The flow balance

Work is measured in **build-equivalents (BE)** — one finished build embodies 1.0 BE of assembly work.
Work is conserved: it is either poured into the line, stored on the line as WiP, or shipped out as a
finished build. Over any week:

```
ΔWiP = input − output          ⇒          output = input − ΔWiP
```

| Quantity | Meaning | Source |
|----------|---------|--------|
| **input** | BE of assembly work performed anywhere on the line this week = `hrs ÷ hrs-per-build` | labour model; matches KPI-376 |
| **WiP** | BE of partial work sitting on the line (sum of fractional progress) | KPI-132 |
| **output** | finished builds leaving the line — **sets delivery dates** | derived |

Cumulatively:

```
cumOutput(w) = cumInput(w) − (WiP_w − WiP_0)
```

### Why this makes the WiP slider move dates

- **Burn WiP down** (`WiP_w < WiP_0`): `cumOutput > cumInput`. You ship the work you're feeding in
  *plus* the partial builds you're draining off the line — a one-time bonus of finished builds equal to
  the WiP drained. Dates pull **in**.
- **Build WiP up** (`WiP_w > WiP_0`): `cumOutput < cumInput`. Work you perform is piling up as partial
  builds instead of shipping. Dates push **out**. (This is the "blocked exit station" case — see §4.)
- **Flat WiP**: `cumOutput = cumInput`. Output equals input; dates are purely throughput-bound and
  independent of the WiP *level*.

`deliveryDates()` therefore scans cumulative **output** (`projection[i].cumOutput`), interpolating the
week at which it crosses each build's cumulative remaining work.

### Worked example

Steady input of 4 BE/wk, `currentWip` = 12, target = 4 over 8 weeks (WiP falls 1 BE/wk):

```
output = 4 − (−1) = 5 BE/wk during the burn-down
```

Over the 8 weeks you ship 8 BE *extra* (40 shipped vs 32 fed in) — exactly the 8 BE of WiP drained.
Once WiP flattens at 4, output reverts to 4 BE/wk. The burn-down is a one-off acceleration, not a
permanent rate change.

## 3. Lead time (Little's Law)

Little's Law (`WiP = throughput × lead-time`) gives the per-unit lead time as a **readout**:

```
lead time (weeks) = WiP ÷ output rate
```

Note this is an *identity*, not a lever: on a throughput-bound line, raising the WiP level lengthens
lead time but does **not** change the completion schedule. The schedule only moves when WiP is *changing*
(§2). Both facts are the same equation with `ΔWiP = 0` or not.

## 4. Scope & assumptions

- **Labour is the binding constraint** in the normal regime: `input = hrs ÷ hrs-per-build` assumes the
  line is balanced and every labour-hour converts into forward progress. If a single station became a
  hard bottleneck (e.g. a blocked exit), throughput would be set by that station, not by total labour —
  the model captures the *symptom* (WiP rising → output starved → dates out) via the flow balance, but
  does not model per-station capacity explicitly. A future extension could cap output by an
  exit-station rate; WiP would then fall out as a diagnostic.
- Output is clamped to ≥ 0 (you cannot un-ship a build); `cumOutput` is monotonic.
- Ramp denominators are clamped to ≥ 1 to avoid divide-by-zero NaN.

## 5. Design history (why not a congestion penalty?)

An earlier iteration made excess WiP inflate effective hours-per-build (a Lean "congestion drag"
penalty), auto-fitted from historical KPI data. It was **rejected** because:

1. It needed an invented penalty curve and an empirical fit over only ~6 weeks of history.
2. It conflated two different things WiP can mean (harmless flowing queue vs. throughput-killing
   bottleneck) into one fudge factor.
3. The flow balance is a *conservation law* — it requires no free parameters, uses exactly the two
   quantities the line already measures (input rate and WiP), and is correct in every regime.

The conservation model replaced it entirely. If you find references to `congestionPenalty`,
`healthyWip` (as a slider), `effectiveHpb`, `dragFactor`, or `fitCongestionPenalty`, they are dead and
should not come back.
